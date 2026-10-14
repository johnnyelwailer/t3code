/**
 * `t3_linked_repository_sync` (`t3team.project.sync_linked_repository`): an agent clones or fetches
 * one linked repository of its thread's project. Linked repositories sync on demand, so this is
 * how an agent gets one it decided it needs. Behavior lives in `syncLinkedRepositoryOnDemand`;
 * this module resolves the calling thread's project and maps errors. The description comes from
 * the catalog.
 *
 * @module t3team-linkedRepositoryTools
 */
import { OrchestratorMcpFailure, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../../../project/ProjectService.ts";
import { T3TeamLinkedRepositorySync } from "../../../t3team-linkedRepositorySync.ts";
import { syncLinkedRepositoryOnDemand } from "../../../t3team-linkedRepositoryOnDemand.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { readThread, unavailable } from "../../threadAccess.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

export const T3TeamLinkedRepositorySyncTool = Tool.make("t3_linked_repository_sync", {
  description: mcpDescriptionOf("t3team.project.sync_linked_repository"),
  parameters: Schema.Struct({
    repository: Schema.String.annotate({
      description:
        "The linked repository as listed in linked-repositories.json: its URL, or owner/repo.",
    }),
    wait: Schema.optional(Schema.Boolean).annotate({
      description: "Wait until the clone/fetch has finished. Default true.",
    }),
  }),
  success: Schema.Struct({
    url: Schema.String,
    state: Schema.Literals(["cloned", "not-cloned", "failed"]),
    localPath: Schema.optional(Schema.String),
    syncedAt: Schema.optional(Schema.String),
    error: Schema.optional(Schema.String),
    syncing: Schema.optional(Schema.Literals(["queued", "cloning", "updating"])),
    mainRepository: Schema.optional(Schema.Literal(true)),
  }),
  failure: Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]),
  // `actsAsCaller` needs ThreadManagementService. The project, sync and file services are resolved
  // when the toolkit layer is built (`makeLinkedRepositorySyncHandler`).
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
});

const syncUnavailable = new T3TeamMcpToolError({
  message: "Linked repositories cannot be synced on this server.",
});

/** The handler, with the services it needs resolved once when the toolkit layer is built (the
 * server always has them; a toolkit test layer without them gets a clear refusal). */
export const makeLinkedRepositorySyncHandler = Effect.gen(function* () {
  const projects = Option.getOrUndefined(
    yield* Effect.serviceOption(ProjectService.ProjectService),
  );
  const sync = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamLinkedRepositorySync));
  const fileSystem = Option.getOrUndefined(yield* Effect.serviceOption(FileSystem.FileSystem));
  const path = Option.getOrUndefined(yield* Effect.serviceOption(Path.Path));
  return Effect.fn("T3TeamMcpToolkit.syncLinkedRepository")(function* (
    threadId: ThreadId,
    input: { readonly repository: string; readonly wait?: boolean | undefined },
  ) {
    if (!projects || !sync || !fileSystem || !path) return yield* syncUnavailable;
    const {
      projection: { thread },
    } = yield* readThread(threadId);
    const project = yield* projects.getById(thread.projectId).pipe(Effect.mapError(unavailable));
    if (Option.isNone(project)) {
      return yield* new T3TeamMcpToolError({ message: "This thread's project was not found." });
    }
    const { view } = yield* syncLinkedRepositoryOnDemand({
      workspaceRoot: project.value.workspaceRoot,
      repository: input.repository,
      wait: input.wait ?? true,
    }).pipe(
      Effect.mapError((error) => new T3TeamMcpToolError({ message: error.message })),
      Effect.provideService(T3TeamLinkedRepositorySync, sync),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
    );
    return view;
  });
});
