/**
 * Delete a cloud session this user started. Joins the MCP server only while
 * `CLOUD_SESSION_STOP_DELETE` is on, so the measured tool list stays unchanged.
 * A call while the flag is off is refused, as for the other flagged tools.
 */
import {
  CloudSessionFailedError,
  type CloudSessionDeleteInfo,
  type CloudSessionDeleteResult,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import { Tool, Toolkit } from "effect/ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { CloudSessionService } from "../../../cloud/t3team-CloudSessionService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { whenMcpToolEnabled } from "../t3team/t3team-mcpToolFeatureGate.ts";

const NOT_STARTED_HERE = "That cloud session is not one this user started, so it was not deleted.";

const CloudSessionDeleteToolInput = Schema.Struct({
  sessionId: Schema.String,
  acknowledgedProjects: Schema.optional(Schema.Array(Schema.String)),
});
type CloudSessionDeleteToolInput = typeof CloudSessionDeleteToolInput.Type;

const CloudSessionDeleteToolResult = Schema.Struct({
  wipBranch: Schema.NullOr(Schema.String),
  warnings: Schema.Array(Schema.String),
});

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  CloudSessionService,
];

const CloudSessionDeleteTool = Tool.make("cloud_session_delete", {
  description:
    "Delete a cloud session this user started. `sessionId` is from `t3_environment_links`. Any other session is refused. Unpushed work is saved on a wip/ branch, then the machine's snapshots and resume branch are removed. If projects exist only in the snapshot, nothing is deleted until `acknowledgedProjects` names them.",
  parameters: CloudSessionDeleteToolInput,
  success: CloudSessionDeleteToolResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Delete a cloud session")
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true);

export const CloudSessionDeleteToolkit = Toolkit.make(CloudSessionDeleteTool);

type DeleteApi = Pick<CloudSessionService["Service"], "deleteInfo" | "delete">;

const refused = (message: string) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message });

const fromServiceError = (error: CloudSessionFailedError) =>
  refused(
    error.reason === "unknown_session" && error.message === "That session does not exist."
      ? NOT_STARTED_HERE
      : error.message,
  );

const unconfirmed = (info: CloudSessionDeleteInfo, acknowledged: ReadonlyArray<string>) =>
  (info.snapshotOnlyProjects ?? []).filter((name) => !acknowledged.includes(name));

const runDelete = Effect.fn("cloud.session.mcp.delete")(function* (
  sessions: DeleteApi,
  input: CloudSessionDeleteToolInput,
) {
  const info = yield* sessions
    .deleteInfo({ sessionId: input.sessionId })
    .pipe(Effect.mapError(fromServiceError));
  const missing = unconfirmed(info, input.acknowledgedProjects ?? []);
  if (missing.length > 0) {
    return yield* refused(
      `These projects have no git remote and exist only in this session's snapshot: ${missing.join(", ")}. Call again with acknowledgedProjects set to those names. Nothing was deleted.`,
    );
  }
  return yield* sessions
    .delete({
      sessionId: input.sessionId,
      acknowledgedProjects: input.acknowledgedProjects,
    })
    .pipe(Effect.mapError(fromServiceError));
});

/** A session this user did not start is refused; the flag off refuses before any delete. */
export const deleteCloudSessionForCaller = (
  sessions: DeleteApi,
  input: CloudSessionDeleteToolInput,
): Effect.Effect<CloudSessionDeleteResult, OrchestratorMcpFailure> =>
  whenMcpToolEnabled("cloud_session_delete", (params: CloudSessionDeleteToolInput) =>
    runDelete(sessions, params),
  )(input).pipe(
    Effect.catchTags({
      T3TeamMcpToolError: (error) => Effect.fail(refused(error.message)),
    }),
  );

const handlers = {
  cloud_session_delete: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const sessions = yield* CloudSessionService;
      return yield* deleteCloudSessionForCaller(sessions, input);
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof CloudSessionDeleteToolkit.tools>;

export const cloudSessionDeleteHandlers = McpToolAccess.toLayer(
  CloudSessionDeleteToolkit,
  handlers,
);
