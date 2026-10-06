/**
 * The services the My Work digest loader reads through its context. The broker does not hold them
 * itself, so they are resolved optionally when it is built: a runtime that lacks any of them gets
 * no My Work tools (they answer "not enabled") rather than a broker that fails to build.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";

import { ServerConfig } from "./config.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { PullRequestService } from "./pullRequest/PullRequestService.ts";
import { GitHubCli } from "./sourceControl/GitHubCli.ts";
import { T3TeamChildThreadMetadata } from "./t3team-childThreadMetadata.ts";
import type { loadT3TeamMyWorkDigestGraph } from "./t3team-myworkDigest.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

/** Everything `loadT3TeamMyWorkDigestGraph` asks of its context. */
export type DigestServices = Effect.Services<ReturnType<typeof loadT3TeamMyWorkDigestGraph>>;

export const resolveDigestContext = (threads: ThreadManagementService["Service"]) =>
  Effect.gen(function* () {
    const sql = yield* Effect.serviceOption(SqlClient.SqlClient);
    const runs = yield* Effect.serviceOption(WorkflowRunRepository);
    const pullRequests = yield* Effect.serviceOption(PullRequestService);
    const gitHubCli = yield* Effect.serviceOption(GitHubCli);
    const serverConfig = yield* Effect.serviceOption(ServerConfig);
    const childMetadata = yield* Effect.serviceOption(T3TeamChildThreadMetadata);
    const facts = yield* Effect.serviceOption(T3TeamThreadFactsStore);
    const toolContexts = yield* Effect.serviceOption(T3TeamThreadToolContextStore);
    const fileSystem = yield* Effect.serviceOption(FileSystem.FileSystem);
    const path = yield* Effect.serviceOption(Path.Path);
    if (
      Option.isNone(sql) ||
      Option.isNone(runs) ||
      Option.isNone(pullRequests) ||
      Option.isNone(gitHubCli) ||
      Option.isNone(serverConfig) ||
      Option.isNone(childMetadata) ||
      Option.isNone(facts) ||
      Option.isNone(toolContexts) ||
      Option.isNone(fileSystem) ||
      Option.isNone(path)
    ) {
      return undefined;
    }
    // Typed, not cast: a service missing from this chain is a compile error here.
    const context: Context.Context<DigestServices> = Context.make(
      SqlClient.SqlClient,
      sql.value,
    ).pipe(
      Context.add(WorkflowRunRepository, runs.value),
      Context.add(PullRequestService, pullRequests.value),
      Context.add(GitHubCli, gitHubCli.value),
      Context.add(ServerConfig, serverConfig.value),
      Context.add(T3TeamChildThreadMetadata, childMetadata.value),
      Context.add(T3TeamThreadFactsStore, facts.value),
      Context.add(T3TeamThreadToolContextStore, toolContexts.value),
      Context.add(FileSystem.FileSystem, fileSystem.value),
      Context.add(Path.Path, path.value),
      Context.add(ThreadManagementService, threads),
    );
    return context;
  });
