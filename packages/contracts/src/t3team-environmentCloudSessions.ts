import * as Schema from "effect/Schema";

import { CloudSessionPhaseSchema } from "./t3team-cloudSession.ts";

/** A Nexi cloud session `t3_environment_links` lists beside the linked environments. */
export const OrchestratorMcpCloudSessionRow = Schema.Struct({
  kind: Schema.Literal("cloud"),
  /** What `delegate_task` takes as `extensions.cloudSession`. */
  sessionId: Schema.String,
  phase: CloudSessionPhaseSchema,
  machineLabel: Schema.String,
  /** The project repository the session was started for, as the session names it. */
  repository: Schema.optional(Schema.String),
  /** When the hold ends (ISO 8601): an upper bound. */
  endsAt: Schema.optional(Schema.String),
});
export type OrchestratorMcpCloudSessionRow = typeof OrchestratorMcpCloudSessionRow.Type;

export const OrchestratorMcpCloudSessions = Schema.Struct({
  sessions: Schema.Array(OrchestratorMcpCloudSessionRow),
  /** Why `sessions` is missing: the broker could not be asked. The links are unaffected. */
  unavailable: Schema.optional(Schema.String),
});
export type OrchestratorMcpCloudSessions = typeof OrchestratorMcpCloudSessions.Type;
