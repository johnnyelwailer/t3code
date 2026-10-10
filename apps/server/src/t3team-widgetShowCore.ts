/**
 * Pure input validation + attachment construction for the `t3team.widget.show` broker tool
 * (Epic 24 ad-hoc widget tier). Effectful orchestration lives in `t3team-widgetShowTool.ts`.
 *
 * `format: "html"` is shimmed onto upstream HtmlRender storage (Phil 2026-10-06): the fragment
 * stays on the attachment for back-compat; an optional `htmlRender` ref points at the published
 * attachment clients render via HtmlRenderFrame. Other formats stay on the widget tier.
 */

import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import type { T3TeamMessageWidgetAttachment } from "@t3tools/contracts";
import type { HtmlRenderReference } from "@t3tools/shared/htmlRender";

import { resolveWidgetCapabilityPolicy } from "./t3team-widgetCapabilityPolicy.ts";

const T3TEAM_WIDGET_SHOW_TOOL_ID = "t3team.widget.show";
const T3TEAM_WIDGET_CODE_MAX_BYTES = 128 * 1024;
const TITLE_MAX_LENGTH = 64;
const INTENT_MAX_LENGTH = 8_000;
const LOADING_MESSAGES_MAX = 8;
const LOADING_MESSAGE_MAX_LENGTH = 200;
const TOOLS_MAX = 16;

/** CSP kept for widget html even when stored via HtmlRender (no remote network). */
export const T3TEAM_WIDGET_HTML_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'";

/** Default frame height when shim-publishing via HtmlRender (clients refine via measured heights). */
export const T3TEAM_WIDGET_HTML_RENDER_DEFAULT_HEIGHT = 400;

export type T3TeamWidgetFormat = "html" | "svg" | "mdx" | "tsx";
const WIDGET_FORMATS: ReadonlySet<T3TeamWidgetFormat> = new Set(["html", "svg", "mdx", "tsx"]);
/** Formats the sandboxed-iframe pipeline renders today. mdx/tsx are reserved seams that will
 * route to the T1 safe-mdx renderer and T2b compose pipeline without changing the tool shape. */
const IMPLEMENTED_WIDGET_FORMATS: ReadonlySet<T3TeamWidgetFormat> = new Set(["html", "svg"]);

export interface T3TeamWidgetShowInput {
  readonly title: string;
  readonly format: T3TeamWidgetFormat;
  /** Present when the caller bypassed the builder with raw code. Empty when intent-only. */
  readonly widgetCode: string;
  /** Preferred default input: what the caller wants to see. Builder authors widgetCode from it. */
  readonly intent: string | undefined;
  readonly loadingMessages: ReadonlyArray<string>;
  /** Allowlist of broker tool ids the widget bridge may call. */
  readonly tools: ReadonlyArray<string>;
}

const FORBIDDEN_DOCUMENT_MARKUP = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i;

function readStringArray(value: unknown, max: number): ReadonlyArray<string> | undefined {
  if (value === undefined) return [];
  if (!globalThis.Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string");
  if (items.length !== value.length) return undefined;
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, max);
}

/**
 * Wrap a validated HTML fragment into a full document suitable for HtmlRender.publish,
 * preserving the widget CSP (`connect-src 'none'`) — never route through publicProxy.
 */
export function wrapWidgetHtmlFragmentForHtmlRender(fragment: string): string {
  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${T3TEAM_WIDGET_HTML_CSP}">`,
    "</head><body>",
    fragment,
    "</body></html>",
  ].join("");
}

/** Validate raw tool arguments. Returns the parsed input or a human-readable error string. */
export function parseT3TeamWidgetShowInput(
  toolArgs: unknown,
): T3TeamWidgetShowInput | { readonly error: string } {
  if (!toolArgs || typeof toolArgs !== "object" || globalThis.Array.isArray(toolArgs)) {
    return {
      error: "t3team.widget.show requires an object with title and intent or widget_code.",
    };
  }
  const args = toolArgs as Record<string, unknown>;

  const rawTitle = typeof args.title === "string" ? args.title.trim() : "";
  if (rawTitle.length === 0) {
    return { error: "title is required and must be a non-empty string." };
  }
  const title = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, TITLE_MAX_LENGTH);
  if (title.length === 0) {
    return { error: "title must contain at least one alphanumeric character." };
  }

  const rawIntent = typeof args.intent === "string" ? args.intent.trim() : "";
  const intent =
    rawIntent.length === 0
      ? undefined
      : rawIntent.length > INTENT_MAX_LENGTH
        ? rawIntent.slice(0, INTENT_MAX_LENGTH)
        : rawIntent;

  const widgetCode = typeof args.widget_code === "string" ? args.widget_code.trim() : "";
  if (widgetCode.length === 0 && intent === undefined) {
    return {
      error:
        "Provide intent (preferred: describe what to show; a builder authors the widget) or widget_code (raw bypass, required for deterministic workflow replay).",
    };
  }
  if (widgetCode.length > 0) {
    // Cap in UTF-8 bytes (what actually gets persisted and shipped), not UTF-16 length.
    if (new TextEncoder().encode(widgetCode).byteLength > T3TEAM_WIDGET_CODE_MAX_BYTES) {
      return {
        error: `widget_code exceeds the ${T3TEAM_WIDGET_CODE_MAX_BYTES / 1024} KB limit.`,
      };
    }
    if (FORBIDDEN_DOCUMENT_MARKUP.test(widgetCode)) {
      return {
        error:
          "widget_code must be a fragment: raw SVG or HTML without <!DOCTYPE>, <html>, <head>, or <body> tags.",
      };
    }
  }

  let format: T3TeamWidgetFormat | undefined;
  if (args.format !== undefined) {
    if (typeof args.format !== "string" || !WIDGET_FORMATS.has(args.format as T3TeamWidgetFormat)) {
      return { error: "format must be one of: html, svg, mdx, tsx." };
    }
    format = args.format as T3TeamWidgetFormat;
  }
  // Mirror the Claude desktop convention: auto-detect svg vs html from the code itself.
  // Intent-only defaults to html (builder / shim path).
  const resolvedFormat =
    format ?? (widgetCode.length > 0 ? (widgetCode.startsWith("<svg") ? "svg" : "html") : "html");
  if (!IMPLEMENTED_WIDGET_FORMATS.has(resolvedFormat)) {
    const target =
      resolvedFormat === "tsx"
        ? "the registered-view compose pipeline (Epic 24 T2b)"
        : "the trusted safe-mdx renderer (Epic 24 T1)";
    return {
      error: `format '${resolvedFormat}' routes to ${target} — not yet available; use format 'html' or 'svg'.`,
    };
  }

  const rawLoadingMessages = readStringArray(args.loading_messages, LOADING_MESSAGES_MAX);
  if (rawLoadingMessages === undefined) {
    return { error: "loading_messages must be an array of strings when provided." };
  }
  const loadingMessages = rawLoadingMessages.map((message) =>
    message.slice(0, LOADING_MESSAGE_MAX_LENGTH),
  );

  let tools: ReadonlyArray<string> = [];
  if (args.capabilities !== undefined) {
    const capabilities = args.capabilities;
    if (
      !capabilities ||
      typeof capabilities !== "object" ||
      globalThis.Array.isArray(capabilities)
    ) {
      return { error: "capabilities must be an object when provided." };
    }
    const parsedTools = readStringArray(
      (capabilities as { readonly tools?: unknown }).tools,
      TOOLS_MAX,
    );
    if (parsedTools === undefined) {
      return { error: "capabilities.tools must be an array of tool-name strings when provided." };
    }
    // Self-referential tools are rejected: a widget must not be able to recursively spawn
    // widgets (or otherwise drive the widget bridge) through its own capability allowlist.
    const selfReferential = parsedTools.find(
      (tool) => tool === T3TEAM_WIDGET_SHOW_TOOL_ID || tool.startsWith("t3team.widget."),
    );
    if (selfReferential) {
      return { error: `capabilities.tools must not include '${selfReferential}'.` };
    }
    tools = parsedTools;
  }

  // Apply the per-format capability policy (Epic 24 trust gradient). For the live html/svg
  // tier this permits an explicit allowlist; a future tier whose policy forbids callTool
  // would have its tools dropped here without changing this call site.
  const policy = resolveWidgetCapabilityPolicy(resolvedFormat);
  const effectiveTools = policy.callToolAllowed ? tools : [];

  return {
    title,
    format: resolvedFormat,
    widgetCode,
    intent,
    loadingMessages,
    tools: effectiveTools,
  };
}

export function buildT3TeamWidgetArtifactRelativePath(input: {
  readonly title: string;
  readonly widgetId: string;
}): string {
  return `${PROJECT_STATE_DIR}/artifacts/widgets/${input.title}-${input.widgetId}.html`;
}

export function buildT3TeamWidgetAttachment(input: {
  readonly widgetId: string;
  readonly parsed: T3TeamWidgetShowInput;
  readonly artifactRelativePath: string | undefined;
  readonly htmlRender?: HtmlRenderReference | undefined;
}): T3TeamMessageWidgetAttachment {
  const { widgetId, parsed, artifactRelativePath, htmlRender } = input;
  return {
    kind: "widget",
    widget: {
      widgetId,
      title: parsed.title,
      format: parsed.format,
      html: parsed.widgetCode,
      ...(htmlRender
        ? {
            htmlRender: {
              attachmentId: htmlRender.attachmentId,
              title: htmlRender.title,
              height: htmlRender.height,
              ...(htmlRender.heights === undefined ? {} : { heights: [...htmlRender.heights] }),
            },
          }
        : {}),
      ...(artifactRelativePath
        ? {
            artifact: {
              kind: "widget-html",
              label: parsed.title,
              path: artifactRelativePath,
              summary: "Ad-hoc widget rendered inline in the chat timeline.",
            },
          }
        : {}),
      ...(parsed.tools.length > 0 ? { capabilities: { tools: parsed.tools } } : {}),
      ...(parsed.loadingMessages.length > 0 ? { loadingMessages: parsed.loadingMessages } : {}),
    },
  };
}
