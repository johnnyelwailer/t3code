/**
 * Effectful orchestration for `t3work.widget.show`: validate input, persist the widget body
 * as a durable Epic 08 rich artifact (format html, via the content-addressed blob store),
 * register the widget's capability allowlist, then upsert a system message carrying the
 * `widget` attachment so the timeline renders it inline.
 */

import { CommandId, MessageId, type OrchestrationCommand, ThreadId } from "@t3tools/contracts";
import type * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as SqlClient from "effect/unstable/sql/SqlClient";

import type { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import { writeT3workContextCasFile } from "./t3work-context-blob-store.ts";
import { ensureT3workContextCacheTables } from "./t3work-context-cache-tables.ts";
import { errorResult, okResult } from "./t3work-toolBrokerHelpers.ts";
import type { T3workToolCallResult } from "./t3work-toolBroker.ts";
import { t3workRandomUUID } from "./t3work-random.ts";
import type { T3workWidgetRegistryShape } from "./t3work-widgetRegistry.ts";
import {
  buildT3workWidgetArtifactRelativePath,
  buildT3workWidgetAttachment,
  parseT3workWidgetShowInput,
} from "./t3work-widgetShowCore.ts";

export type T3workWidgetPersistenceServices =
  | FileSystem.FileSystem
  | Path.Path
  | SqlClient.SqlClient
  | WorkspacePaths;

export interface T3workWidgetShowDeps {
  readonly threadId: string;
  readonly workspaceRoot: string | undefined;
  readonly registry: T3workWidgetRegistryShape;
  readonly dispatch: (command: OrchestrationCommand) => Effect.Effect<unknown, string>;
  /** Services the CAS persistence path needs (SqlClient, FileSystem, Path, ...), captured by
   * the broker layer at build time. Persistence is skipped when they are unavailable. */
  readonly persistenceContext: Context.Context<T3workWidgetPersistenceServices> | undefined;
}

export function callT3workWidgetShowTool(input: {
  readonly toolArgs: unknown;
  readonly deps: T3workWidgetShowDeps;
}): Effect.Effect<T3workToolCallResult> {
  const { toolArgs, deps } = input;
  return Effect.gen(function* () {
    const parsed = parseT3workWidgetShowInput(toolArgs);
    if ("error" in parsed) {
      return errorResult(parsed.error);
    }

    const widgetId = t3workRandomUUID();

    // Rich Artifact Discipline: persist the widget body durably before showing it. Persistence
    // failures degrade to an inline-only widget (the attachment carries the HTML) rather than
    // failing the render.
    let artifactRelativePath: string | undefined;
    if (deps.workspaceRoot && deps.persistenceContext) {
      const relativePath = buildT3workWidgetArtifactRelativePath({
        title: parsed.title,
        widgetId,
      });
      const written = yield* ensureT3workContextCacheTables().pipe(
        Effect.andThen(
          writeT3workContextCasFile({
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
        yield* Effect.logWarning("t3work.widget.show artifact persistence failed", {
          threadId: deps.threadId,
          widgetId,
        });
      }
    }

    yield* deps.registry.put({
      widgetId,
      threadId: deps.threadId,
      tools: parsed.tools,
    });

    const attachment = buildT3workWidgetAttachment({
      widgetId,
      parsed,
      artifactRelativePath,
    });
    const dispatched = yield* deps
      .dispatch({
        type: "thread.message.upsert",
        commandId: CommandId.make(`server:t3work:widget:${t3workRandomUUID()}`),
        threadId: ThreadId.make(deps.threadId),
        message: {
          messageId: MessageId.make(t3workRandomUUID()),
          role: "system",
          text: "",
          turnId: null,
          streaming: false,
          t3workExt: {
            author: { kind: "system" },
            visibleToUser: true,
            visibleToAgent: false,
            attachments: [attachment],
          },
        },
        createdAt: DateTime.formatIso(yield* DateTime.now),
      })
      .pipe(Effect.result);
    if (dispatched._tag === "Failure") {
      return errorResult("Failed to post the widget message to the thread.");
    }

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
