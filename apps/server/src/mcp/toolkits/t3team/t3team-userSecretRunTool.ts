/**
 * `t3_user_secret_run`: an agent runs one command with granted user secrets injected by the host.
 * The transport only resolves the calling thread and its workspace; behaviour lives in
 * `UserSecretProcessInjection`.
 */
import {
  OrchestratorMcpFailure,
  UserSecretRunInput,
  UserSecretRunResult,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { threadWorkspaceRoot } from "../../../project/threadWorkspaceRoot.ts";
import * as ProjectService from "../../../project/ProjectService.ts";
import {
  USER_SECRET_RUN_TOOL,
  UserSecretProcessInjection,
} from "../../../secrets/t3team-UserSecretProcessInjection.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";

export const T3TeamUserSecretRunTool = Tool.make(USER_SECRET_RUN_TOOL, {
  description:
    "Run one shell command with some of the user's secrets injected by the host, so you never see " +
    "the values. Name granted secrets; each arrives as a private file whose path is in <NAME>_FILE " +
    "(preferred), or as an environment variable with as:'env'. Let the command read them through " +
    'that variable (e.g. mytool --password-file "$DB_PASSWORD_FILE"); never put a value in the command and ' +
    "never print one: every injected value is masked in the output. " +
    "Only secrets granted to this session work; others are refused. The user may have to approve " +
    "the use in the app first, which this call waits for. Pass destination when the command sends " +
    "a secret to a host. A refusal or a declined approval is final: tell the user, do not retry.",
  parameters: UserSecretRunInput,
  success: UserSecretRunResult,
  failure: Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]),
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
});

const unavailable = new T3TeamMcpToolError({
  message: "User secrets cannot be used on this server.",
});

/** Services resolved when the toolkit layer is built; a toolkit without them refuses. */
export const makeUserSecretRunHandler = Effect.gen(function* () {
  const injection = Option.getOrUndefined(yield* Effect.serviceOption(UserSecretProcessInjection));
  const threads = Option.getOrUndefined(
    yield* Effect.serviceOption(ThreadManagementService.ThreadManagementService),
  );
  const projects = Option.getOrUndefined(
    yield* Effect.serviceOption(ProjectService.ProjectService),
  );
  return Effect.fn("T3TeamMcpToolkit.userSecretRun")(function* (
    threadId: ThreadId,
    input: UserSecretRunInput,
  ) {
    if (!injection || !threads || !projects) return yield* unavailable;
    const cwd = yield* threadWorkspaceRoot(threadId).pipe(
      Effect.provideService(ThreadManagementService.ThreadManagementService, threads),
      Effect.provideService(ProjectService.ProjectService, projects),
    );
    return yield* injection
      .run({ consumerId: threadId, threadId, tool: USER_SECRET_RUN_TOOL, cwd, input })
      .pipe(Effect.mapError((error) => new T3TeamMcpToolError({ message: error.message })));
  });
});
