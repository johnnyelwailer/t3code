/**
 * Pure input validation + attachment construction for the `t3work.widget.show` broker tool
 * (Epic 24 ad-hoc widget tier). Effectful orchestration lives in `t3work-widgetShowTool.ts`.
 */

import type { T3workMessageWidgetAttachment } from "@t3tools/contracts";

export const T3WORK_WIDGET_SHOW_TOOL_ID = "t3work.widget.show";
export const T3WORK_WIDGET_CODE_MAX_BYTES = 128 * 1024;
const TITLE_MAX_LENGTH = 64;
const LOADING_MESSAGES_MAX = 8;
const TOOLS_MAX = 16;

export type T3workWidgetFormat = "html" | "svg" | "mdx" | "tsx";
const WIDGET_FORMATS: ReadonlySet<T3workWidgetFormat> = new Set(["html", "svg", "mdx", "tsx"]);
/** Formats the sandboxed-iframe pipeline renders today. mdx/tsx are reserved seams that will
 * route to the T1 safe-mdx renderer and T2b compose pipeline without changing the tool shape. */
const IMPLEMENTED_WIDGET_FORMATS: ReadonlySet<T3workWidgetFormat> = new Set(["html", "svg"]);

export interface T3workWidgetShowInput {
  readonly title: string;
  readonly format: T3workWidgetFormat;
  readonly widgetCode: string;
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

/** Validate raw tool arguments. Returns the parsed input or a human-readable error string. */
export function parseT3workWidgetShowInput(
  toolArgs: unknown,
): T3workWidgetShowInput | { readonly error: string } {
  if (!toolArgs || typeof toolArgs !== "object" || globalThis.Array.isArray(toolArgs)) {
    return { error: "t3work.widget.show requires an object with title and widget_code." };
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

  const widgetCode = typeof args.widget_code === "string" ? args.widget_code.trim() : "";
  if (widgetCode.length === 0) {
    return { error: "widget_code is required and must be a non-empty string." };
  }
  if (widgetCode.length > T3WORK_WIDGET_CODE_MAX_BYTES) {
    return {
      error: `widget_code exceeds the ${T3WORK_WIDGET_CODE_MAX_BYTES / 1024} KB limit.`,
    };
  }
  if (FORBIDDEN_DOCUMENT_MARKUP.test(widgetCode)) {
    return {
      error:
        "widget_code must be a fragment: raw SVG or HTML without <!DOCTYPE>, <html>, <head>, or <body> tags.",
    };
  }

  let format: T3workWidgetFormat | undefined;
  if (args.format !== undefined) {
    if (typeof args.format !== "string" || !WIDGET_FORMATS.has(args.format as T3workWidgetFormat)) {
      return { error: "format must be one of: html, svg, mdx, tsx." };
    }
    format = args.format as T3workWidgetFormat;
  }
  // Mirror the Claude desktop convention: auto-detect svg vs html from the code itself.
  const resolvedFormat = format ?? (widgetCode.startsWith("<svg") ? "svg" : "html");
  if (!IMPLEMENTED_WIDGET_FORMATS.has(resolvedFormat)) {
    const target =
      resolvedFormat === "tsx"
        ? "the registered-view compose pipeline (Epic 24 T2b)"
        : "the trusted safe-mdx renderer (Epic 24 T1)";
    return {
      error: `format '${resolvedFormat}' routes to ${target} — not yet available; use format 'html' or 'svg'.`,
    };
  }

  const loadingMessages = readStringArray(args.loading_messages, LOADING_MESSAGES_MAX);
  if (loadingMessages === undefined) {
    return { error: "loading_messages must be an array of strings when provided." };
  }

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
    tools = parsedTools;
  }

  return { title, format: resolvedFormat, widgetCode, loadingMessages, tools };
}

export function buildT3workWidgetArtifactRelativePath(input: {
  readonly title: string;
  readonly widgetId: string;
}): string {
  return `.t3work/artifacts/widgets/${input.title}-${input.widgetId}.html`;
}

export function buildT3workWidgetAttachment(input: {
  readonly widgetId: string;
  readonly parsed: T3workWidgetShowInput;
  readonly artifactRelativePath: string | undefined;
}): T3workMessageWidgetAttachment {
  const { widgetId, parsed, artifactRelativePath } = input;
  return {
    kind: "widget",
    widget: {
      widgetId,
      title: parsed.title,
      format: parsed.format,
      html: parsed.widgetCode,
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
