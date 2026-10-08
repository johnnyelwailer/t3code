/**
 * Effectful orchestration for `t3team.widget.show`: validate input, optionally run the
 * intent→builder seam, persist the widget body, and for `format: "html"` shim-publish through
 * upstream HtmlRender (one HTML renderer). Other formats stay on the widget tier.
 * V2 messages carry no rich payload, so the artifact — not a message — is the carrier.
 */

import { ThreadId } from "@t3tools/contracts";
import type { HtmlRenderReference } from "@t3tools/shared/htmlRender";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as SqlClient from "effect/sql/SqlClient";

import type { HtmlRender } from "./htmlRender/HtmlRender.ts";
import type { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import { writeT3TeamContextCasFile } from "./t3team-context-blob-store.ts";
import { ensureT3TeamContextCacheTables } from "./t3team-context-cache-tables.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import type { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import { authorWidgetFromIntent, shouldBypassBuilder } from "./t3team-widgetBuilder.ts";
import type { T3TeamWidgetRegistryShape } from "./t3team-widgetRegistry.ts";
import {
  buildT3TeamWidgetArtifactRelativePath,
  buildT3TeamWidgetAttachment,
  parseT3TeamWidgetShowInput,
  T3TEAM_WIDGET_HTML_RENDER_DEFAULT_HEIGHT,
  wrapWidgetHtmlFragmentForHtmlRender,
  type T3TeamWidgetShowInput,
} from "./t3team-widgetShowCore.ts";

export type T3TeamWidgetPersistenceServices =
  | FileSystem.FileSystem
  | Path.Path
  | SqlClient.SqlClient
  | WorkspacePaths;

/** Artifact kind of a widget row in the thread artifacts store. */
export const T3TEAM_WIDGET_ARTIFACT_KIND = "widget";

/** Deterministic artifact id of a widget, so a retried write is idempotent. */
export const t3teamWidgetArtifactId = (widgetId: string) => `widget:${widgetId}`;

export interface T3TeamWidgetShowDeps {
  readonly threadId: string;
  readonly workspaceRoot: string | undefined;
  readonly registry: T3TeamWidgetRegistryShape;
  /** Durable artifact write (`T3TeamThreadArtifactsStore.upsert`). */
  readonly recordArtifact: T3TeamThreadArtifactsStore["Service"]["upsert"];
  /** Services the CAS persistence path needs (SqlClient, FileSystem, Path, ...), captured by
   * the broker layer at build time. Persistence is skipped when they are unavailable. */
  readonly persistenceContext: Context.Context<T3TeamWidgetPersistenceServices> | undefined;
  /**
   * Upstream HtmlRender service for the html-format shim. Optional: when absent or publish
   * fails, the widget degrades to the legacy inline/srcdoc path (still succeeds).
   */
  readonly htmlRender: HtmlRender["Service"] | undefined;
}

const resolveWidgetCode = (
  parsed: T3TeamWidgetShowInput,
): Effect.Effect<T3TeamWidgetShowInput, string> =>
  Effect.gen(function* () {
    if (shouldBypassBuilder(parsed)) {
      return parsed;
    }
    if (parsed.intent === undefined) {
      return yield* Effect.fail("Provide intent (preferred) or widget_code (raw bypass).");
    }
    const authored = yield* authorWidgetFromIntent({
      intent: parsed.intent,
      title: parsed.title,
      format: parsed.format,
    });
    return {
      ...parsed,
      widgetCode: authored.widgetCode,
      format: authored.format,
    } satisfies T3TeamWidgetShowInput;
  });

const publishHtmlShim = (input: {
  readonly threadId: string;
  readonly parsed: T3TeamWidgetShowInput;
  readonly htmlRender: HtmlRender["Service"];
}): Effect.Effect<HtmlRenderReference | undefined> =>
  Effect.gen(function* () {
    const wrapped = wrapWidgetHtmlFragmentForHtmlRender(input.parsed.widgetCode);
    const published = yield* input.htmlRender
      .publish({
        threadId: ThreadId.make(input.threadId),
        html: wrapped,
        title: input.parsed.title,
        height: T3TEAM_WIDGET_HTML_RENDER_DEFAULT_HEIGHT,
      })
      .pipe(Effect.result);
    if (published._tag === "Success") {
      return published.success;
    }
    yield* Effect.logWarning(
      "t3team.widget.show HtmlRender shim publish failed; using srcdoc path",
      {
        threadId: input.threadId,
        cause: published.failure,
      },
    );
    return undefined;
  });

export function callT3TeamWidgetShowTool(input: {
  readonly toolArgs: unknown;
  readonly deps: T3TeamWidgetShowDeps;
}): Effect.Effect<T3TeamToolCallResult> {
  const { toolArgs, deps } = input;
  return Effect.gen(function* () {
    const parsedOrError = parseT3TeamWidgetShowInput(toolArgs);
    if ("error" in parsedOrError) {
      return errorResult(parsedOrError.error);
    }

    const resolved = yield* resolveWidgetCode(parsedOrError).pipe(Effect.result);
    if (resolved._tag === "Failure") {
      return errorResult(resolved.failure);
    }
    const parsed = resolved.success;

    const widgetId = t3teamRandomUUID();

    // Rich Artifact Discipline: persist the widget body durably before showing it. Persistence
    // failures degrade to an inline-only widget (the attachment carries the HTML) rather than
    // failing the render.
    let artifactRelativePath: string | undefined;
    if (deps.workspaceRoot && deps.persistenceContext) {
      const relativePath = buildT3TeamWidgetArtifactRelativePath({
        title: parsed.title,
        widgetId,
      });
      const written = yield* ensureT3TeamContextCacheTables().pipe(
        Effect.andThen(
          writeT3TeamContextCasFile({
            workspaceRoot: deps.workspaceRoot,
            relativePath,
            contents: parsed.widgetCode,
          }),
        ),
        Effect.provide(deps.persistenceContext),
        Effect.result,
      );
      if (written._tag === "Success") {
        artifactRelativePath = relativePath;
      } else {
        yield* Effect.logWarning("t3team.widget.show artifact persistence failed", {
          threadId: deps.threadId,
          widgetId,
        });
      }
    }

    // html format → upstream HtmlRender publish (shim). svg and others stay on widget tier.
    let htmlRenderRef: HtmlRenderReference | undefined;
    if (parsed.format === "html" && deps.htmlRender) {
      htmlRenderRef = yield* publishHtmlShim({
        threadId: deps.threadId,
        parsed,
        htmlRender: deps.htmlRender,
      });
    }

    const attachment = buildT3TeamWidgetAttachment({
      widgetId,
      parsed,
      artifactRelativePath,
      htmlRender: htmlRenderRef,
    });
    const recorded = yield* deps
      .recordArtifact({
        id: t3teamWidgetArtifactId(widgetId),
        threadId: ThreadId.make(deps.threadId),
        messageId: null,
        kind: T3TEAM_WIDGET_ARTIFACT_KIND,
        payload: attachment,
      })
      .pipe(Effect.result);
    if (recorded._tag === "Failure") {
      return errorResult("Failed to post the widget to the thread.");
    }

    // Register only after the artifact write succeeded, so failed writes never
    // consume registry slots (the registry is bounded per thread and globally).
    yield* deps.registry.put({
      widgetId,
      threadId: deps.threadId,
      tools: parsed.tools,
    });

    return okResult({
      ok: true,
      widgetId,
      title: parsed.title,
      format: parsed.format,
      ...(artifactRelativePath ? { artifactPath: artifactRelativePath } : {}),
      ...(htmlRenderRef ? { htmlRender: htmlRenderRef } : {}),
      ...(parsed.intent !== undefined ? { intent: parsed.intent } : {}),
      allowedTools: parsed.tools,
      htmlShimmed: parsed.format === "html" && htmlRenderRef !== undefined,
    });
  });
}
