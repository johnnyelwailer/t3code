/**
 * Out-of-band background-job control between the host and an agent runtime.
 *
 * Some runtimes background a long-running shell command instead of blocking
 * the turn (the Nexplore/Pi runtime does this at ~10s). The job then outlives
 * the turn: the host's transcript only learns about it when the runtime's own
 * tools or completion notices surface, so the host (and its UI) can also reach
 * the runtime's live job registry directly — list the jobs a thread's session
 * owns, cancel one, or read a bounded page of its retained output.
 *
 * These types cross two seams:
 * - HTTP: `POST /api/t3team/thread/jobs` (apps/server) <-> the web client;
 * - provider: `ProviderAdapter.jobControl` <-> the pack driver's
 *   `PackProviderInstance.jobControl` (a structurally identical Promise-based
 *   copy lives in @t3team/pack-api / @t3team/packs — the host mirrors pack
 *   types rather than importing the pack SDK at runtime).
 *
 * Every result is a discriminated union on `kind`; `unknown-job` is a RESULT,
 * not an error — a job id the registry does not own (settled-ago, other
 * session, fabricated) must not take the route down.
 *
 * @module providerJobControl
 */
import * as Schema from "effect/Schema";

/**
 * The registry's settled vocabulary (pi-exec-jobs): running plus the four
 * terminal states. Unknown words are rejected — the adapter is expected to
 * normalize, and a free-form state would break the client's equality checks.
 */
export const ProviderJobState = Schema.Literals([
  "running",
  "completed",
  "failed",
  "killed-deadline",
  "cancelled",
]);
export type ProviderJobState = typeof ProviderJobState.Type;

/** One live job as the runtime's own registry reports it. */
export const ProviderJobSummary = Schema.Struct({
  jobId: Schema.String,
  command: Schema.String,
  pid: Schema.optionalKey(Schema.Number),
  state: ProviderJobState,
  exitCode: Schema.NullOr(Schema.Number),
  startedAtMs: Schema.Number,
});
export type ProviderJobSummary = typeof ProviderJobSummary.Type;

/**
 * One job-control request. `read-output` is cursor-paged in BYTES: `since`
 * is a byte offset into the retained stream (0 = from the start of what is
 * retained) and `maxBytes` caps the page — the runtime keeps a bounded ring
 * (torn UTF-8 boundaries are resolved by the runtime, never the client).
 */
export const ProviderJobControlRequest = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("list") }),
  Schema.Struct({ kind: Schema.Literal("cancel"), jobId: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("read-output"),
    jobId: Schema.String,
    since: Schema.optionalKey(Schema.Number),
    maxBytes: Schema.optionalKey(Schema.Number),
  }),
]);
export type ProviderJobControlRequest = typeof ProviderJobControlRequest.Type;

/** The discriminated results. `kind` mirrors the request, minus "list". */
export const ProviderJobControlResult = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("jobs"), jobs: Schema.Array(ProviderJobSummary) }),
  Schema.Struct({
    kind: Schema.Literal("cancelled"),
    jobId: Schema.String,
    state: ProviderJobState,
    exitCode: Schema.NullOr(Schema.Number),
    elapsedMs: Schema.Number,
    command: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("output"),
    jobId: Schema.String,
    text: Schema.String,
    nextCursor: Schema.Number,
    oldestRetained: Schema.Number,
    settled: Schema.Boolean,
  }),
  Schema.Struct({ kind: Schema.Literal("unknown-job"), jobId: Schema.String }),
]);
export type ProviderJobControlResult = typeof ProviderJobControlResult.Type;
