/**
 * Workflow-engine error taxonomy (Epic 25 §Error classes). Every primitive failure the engine
 * raises is classified into exactly one of these classes so workflow authors can branch with
 * `instanceof`. The base {@link WorkflowError} and the subclasses are injected into the
 * workflow body as globals (see workflowGlobals.ts), so author code that references e.g.
 * `PermissionDeniedError` resolves the identifier. Phase 25.2 only *throws* a subset (replay
 * divergence, load-time refusal, journal corruption); the rest are declared so the taxonomy is
 * complete and stable. Real named classes (not a factory) so `instanceof` works in bodies.
 */
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export class TimeoutError extends WorkflowError {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}
export class SchemaExhaustedError extends WorkflowError {
  constructor(message: string) {
    super(message);
    this.name = "SchemaExhaustedError";
  }
}
export class ProviderUnavailableError extends WorkflowError {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
export class PermissionDeniedError extends WorkflowError {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}
export class TargetMissingError extends WorkflowError {
  constructor(message: string) {
    super(message);
    this.name = "TargetMissingError";
  }
}
export class CancelledError extends WorkflowError {
  constructor(message: string) {
    super(message);
    this.name = "CancelledError";
  }
}
/**
 * First-class abort (Epic 25 §Error classes). Thrown when the run's {@link AbortSignal} fires
 * (engine pre-check or the durable runtime's live-call check); the engine converts it into the
 * `aborted` outcome and re-throws so the caller can tell "aborted" apart from "failed".
 * Distinct from {@link CancelledError} (a primitive-level cancellation) — this settles the run.
 */
export class WorkflowAborted extends WorkflowError {
  constructor(message = "Workflow run was aborted.") {
    super(message);
    this.name = "WorkflowAborted";
  }
}
/** Refuses to load a workflow that violates a determinism contract at load time. */
export class WorkflowLoadError extends WorkflowError {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowLoadError";
  }
}

/**
 * Raised when the launch/resume args fail to decode against a workflow's declared
 * `meta.inputs`. Distinct from every other decode/runtime failure the taxonomy above
 * classifies: the workflow SOURCE is not at fault here — the CALLER passed wrong or
 * missing arguments. A host-side repair funnel must route this to an ARGS correction,
 * never a source rewrite (see `workflowRepairTargetFor` in the t3code distribution's
 * `t3team-workflowRepairGuardrails.ts`, which uses `instanceof` on this class rather
 * than matching the message text).
 */
export class WorkflowInputDecodeError extends WorkflowError {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "WorkflowInputDecodeError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Raised when {@link resumeWorkflow} is asked to continue a run whose journal does not exist
 * on disk — almost always a typo'd `runId`, a wiped runs root, or a wrong `runsRoot`.
 */
export class WorkflowRunNotFoundError extends WorkflowError {
  readonly journalPath: string;
  constructor(journalPath: string) {
    super(
      `No workflow journal found at '${journalPath}'. resumeWorkflow can only continue a run that has already been started; check the runId and runsRoot, or call startWorkflow to begin a new run.`,
    );
    this.name = "WorkflowRunNotFoundError";
    this.journalPath = journalPath;
  }
}

/**
 * Raised when `checkpoint()` is called from inside a SUB-workflow body. A sub-workflow journals
 * into the same run sequence as its parent and shares the run's checkpoint primitive, so a
 * boundary committed there would move the run's SHARED replay window: a crash mid-sub-workflow
 * would re-drive the TOP-level body from the child's boundary, no longer at its journaled seqs —
 * the pre-loop setup and the child prefix would re-fire live (external effects double-execute)
 * or fail drift, silently breaking the no-refire guarantee. Checkpoints are only valid in the
 * top-level run body.
 *
 * `verb` names the refused call: `watermark()` commits its cursor as a checkpoint boundary, so it
 * is refused in a sub-workflow for the same reason.
 */
export class SubWorkflowCheckpointError extends WorkflowError {
  constructor(verb: "checkpoint()" | "watermark()" = "checkpoint()") {
    super(
      `${verb} is not valid inside a sub-workflow body: checkpoints are only valid in the ` +
        "top-level run body. A sub-workflow journals into the same run sequence as its parent and " +
        "shares the run's checkpoint primitive, so a boundary committed here would move the run's " +
        "shared replay window and silently break the no-refire guarantee on crash-resume. Move the " +
        `${verb} call to the top-level body.`,
    );
    this.name = "SubWorkflowCheckpointError";
  }
}

/**
 * Raised when a body mixes `watermark()` with a raw `checkpoint()`. Both commit the run's ONE
 * replay boundary, and a resume restores only the latest one: a raw checkpoint after a watermark
 * advance would drop every durable cursor (the next resume re-reads already processed input), and
 * a watermark advance after a raw checkpoint would replace the author's compact state. So a run's
 * boundary has one owner, fixed by the first of the two calls (or by the state a resume restored).
 */
export class WatermarkScopeError extends WorkflowError {
  readonly owner: "watermark" | "checkpoint";
  constructor(owner: "watermark" | "checkpoint") {
    super(
      owner === "watermark"
        ? "checkpoint() is not valid in a body that uses watermark(): the watermark owns this run's " +
            "checkpoint boundary, and a raw checkpoint would replace every durable cursor. Carry " +
            "the extra state outside the checkpoint, or drop the watermark."
        : "watermark() is not valid in a body that commits raw checkpoint() boundaries: the run's " +
            "boundary already carries the author's compact state, and a watermark advance would " +
            "replace it. Use either checkpoint() or watermark() in one run body, not both.",
    );
    this.name = "WatermarkScopeError";
    this.owner = owner;
  }
}

/**
 * Raised when a primitive's recorded result cannot be re-encoded to the journal before the line
 * is written — the handler returned a value that is not canonical-JSON (bigint/function/symbol).
 * The side effect has *already* happened, so this makes the hazard visible at the call site.
 */
export class JournalSerializeError extends WorkflowError {
  readonly seq: number;
  readonly kind: string;
  readonly refId: string;
  constructor(opts: {
    readonly seq: number;
    readonly kind: string;
    readonly refId: string;
    readonly cause: unknown;
  }) {
    const reason = opts.cause instanceof Error ? opts.cause.message : String(opts.cause);
    super(
      `Cannot journal the result of ${opts.kind} '${opts.refId}' at seq ${opts.seq}: the value is not canonical-JSON-encodable (${reason}). The side effect already ran, so this seq may re-execute on resume. Return a JSON-serializable value from the handler.`,
    );
    this.name = "JournalSerializeError";
    this.seq = opts.seq;
    this.kind = opts.kind;
    this.refId = opts.refId;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

/**
 * Raised on resume when a *recorded* journal result fails to decode against the current
 * result schema — the on-disk journal is corrupt or schema-incompatible (distinct from
 * {@link ReplayDriftError}, which means the body diverged).
 */
export class JournalSchemaError extends WorkflowError {
  readonly seq: number;
  readonly kind: string;
  readonly refId: string;
  constructor(opts: {
    readonly seq: number;
    readonly kind: string;
    readonly refId: string;
    readonly cause: unknown;
  }) {
    const reason = opts.cause instanceof Error ? opts.cause.message : String(opts.cause);
    super(
      `Recorded result for ${opts.kind} '${opts.refId}' at seq ${opts.seq} does not match the current result schema: ${reason}. The journal is corrupt or schema-incompatible with this version of the workflow; this is distinct from replay drift.`,
    );
    this.name = "JournalSchemaError";
    this.seq = opts.seq;
    this.kind = opts.kind;
    this.refId = opts.refId;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

/** Side of a replay comparison — what the journal recorded vs. what the body produced. */
export type ReplayDriftFacet = Readonly<Record<string, string>>;
/** Whether the divergence is in the workflow version, call identity, or argument hash. */
export type ReplayDriftReason = "workflow" | "call" | "args";

/**
 * Raised on resume when the replayed body diverges from the journal at a given `seq`.
 *
 * `callId` is `"<seq>:<kind>:<refId>"` (see the engine module header for why we chose a
 * sequence counter over lexical position). `reason: "workflow"` = the executable source
 * changed, `reason: "call"` = different (kind, refId) (inserted/removed/reordered primitive),
 * and `reason: "args"` = same call, different args.
 */
export class ReplayDriftError extends WorkflowError {
  readonly seq: number;
  readonly reason: ReplayDriftReason;
  readonly expected: ReplayDriftFacet;
  readonly observed: ReplayDriftFacet;
  /** Absolute path of the `.workflow.ts` whose body diverged, when the engine knows it. */
  readonly filePath?: string;
  constructor(opts: {
    readonly seq: number;
    readonly reason: ReplayDriftReason;
    readonly expected: ReplayDriftFacet;
    readonly observed: ReplayDriftFacet;
    readonly filePath?: string;
  }) {
    super(formatReplayDrift(opts));
    this.name = "ReplayDriftError";
    this.seq = opts.seq;
    this.reason = opts.reason;
    this.expected = opts.expected;
    this.observed = opts.observed;
    if (opts.filePath !== undefined) this.filePath = opts.filePath;
  }
}

const formatFacet = (facet: ReplayDriftFacet): string =>
  Object.entries(facet)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

function formatReplayDrift(opts: {
  readonly seq: number;
  readonly reason: ReplayDriftReason;
  readonly expected: ReplayDriftFacet;
  readonly observed: ReplayDriftFacet;
  readonly filePath?: string;
}): string {
  // Spec doc 25 §"How replay works" promises drift errors cite the file and the seq.
  // Line/column carry-through is deferred (it needs a per-statement source map); the
  // absolute path plus seq is the cheap, already-known locator.
  const at = opts.filePath === undefined ? `seq ${opts.seq}` : `${opts.filePath}:seq ${opts.seq}`;
  const headline =
    opts.reason === "workflow"
      ? `Workflow replay drift at ${at}: the executable workflow version changed.`
      : opts.reason === "call"
        ? `Workflow replay drift at ${at}: the primitive call changed identity.`
        : `Workflow replay drift at ${at}: same call site, different arguments.`;
  return `${headline}\n  expected (journal): ${formatFacet(opts.expected)}\n  observed (replay):  ${formatFacet(opts.observed)}\nThe workflow body diverged from its journal — this run is version-incompatible with the recorded one.`;
}
