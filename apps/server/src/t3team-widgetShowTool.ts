/**
 * Effectful orchestration for `t3team.widget.show`: validate input, persist the widget body
 * as a durable Epic 08 rich artifact (format html, via the content-addressed blob store),
 * register the widget's capability allowlist, then record a `widget` thread artifact (U0
 * artifacts side store, `t3team.subscribeThreadArtifacts`) so the timeline renders it inline.
 * V2 messages carry no rich payload, so the artifact — not a message — is the carrier.
 */

import { ThreadId } from "@t3tools/contracts";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as SqlClient from "effect/sql/SqlClient";

import type { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import { writeT3TeamContextCasFile } from "./t3team-context-blob-store.ts";
import { ensureT3TeamContextCacheTables } from "./t3team-context-cache-tables.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import type { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import type { T3TeamWidgetRegistryShape } from "./t3team-widgetRegistry.ts";
import {
  buildT3TeamWidgetArtifactRelativePath,
  buildT3TeamWidgetAttachment,
  parseT3TeamWidgetShowInput,
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
}

export function callT3TeamWidgetShowTool(input: {
  readonly toolArgs: unknown;
  readonly deps: T3TeamWidgetShowDeps;
}): Effect.Effect<T3TeamToolCallResult> {
  const { toolArgs, deps } = input;
  return Effect.gen(function* () {
    const parsed = parseT3TeamWidgetShowInput(toolArgs);
    if ("error" in parsed) {
      return errorResult(parsed.error);
    }

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

    const attachment = buildT3TeamWidgetAttachment({
      widgetId,
      parsed,
      artifactRelativePath,
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
      allowedTools: parsed.tools,
    });
  });
}
