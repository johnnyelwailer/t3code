/**
 * Workflow-engine error taxonomy (Epic 25 §Error classes).
 *
 * Every primitive failure the engine raises is classified into exactly one of these
 * classes so workflow authors can branch with `instanceof`. The base {@link WorkflowError}
 * is injected into the workflow body as a global (see t3work-sdk.workflowGlobals.ts); the
 * subclasses are injected alongside it so author code that references e.g.
 * `PermissionDeniedError` resolves the identifier.
 *
 * Phase 25.2 only *throws* a subset of these (replay divergence, load-time refusal,
 * journal corruption). The remaining subclasses are declared here so the taxonomy is
 * complete and stable; the primitives that raise them land in 25.3–25.5.
 *
 * The taxonomy is `class` declarations (not a generic factory) so that `instanceof
 * <ErrorSubclass>` works inside workflow bodies — the spec's catchable-error contract
 * depends on the class identity being a real, named class.
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
/** Refuses to load a workflow that violates a determinism contract at load time. */
export class WorkflowLoadError extends WorkflowError {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowLoadError";
  }
}

/**
 * Raised when {@link resumeWorkflow} is asked to continue a run whose journal does not
 * exist on disk. Resuming a non-existent run is almost always a typo'd `runId`, a wiped
 * runs root, or a wrong `runsRoot` option — surfacing it loudly prevents the engine from
 * silently degrading a resume into a fresh start.
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
 * Raised when a primitive's recorded result cannot be re-encoded to the journal before
 * the line is written — the handler returned a value that is not canonical-JSON
 * (bigint/function/symbol/non-finite). The side effect has *already* happened, so this
 * error makes the hazard visible at the call site instead of silently corrupting the
 * journal.
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
 * tool/script result schema. Distinct from {@link ReplayDriftError} (body diverged) — this
 * means the on-disk journal is corrupt or schema-incompatible with the current code.
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
/** Whether the divergence is in the call identity (kind/refId) or the argument hash. */
export type ReplayDriftReason = "call" | "args";

/**
 * Raised on resume when the replayed body diverges from the journal at a given `seq`.
 *
 * `callId` is `"<seq>:<kind>:<refId>"` (see the engine module header for why we chose a
 * sequence counter over lexical position). `reason: "call"` = different (kind, refId)
 * (inserted/removed/reordered primitive). `reason: "args"` = same call, different args.
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
    opts.reason === "call"
      ? `Workflow replay drift at ${at}: the primitive call changed identity.`
      : `Workflow replay drift at ${at}: same call site, different arguments.`;
  return `${headline}\n  expected (journal): ${formatFacet(opts.expected)}\n  observed (replay):  ${formatFacet(opts.observed)}\nThe workflow body diverged from its journal — this run is version-incompatible with the recorded one.`;
}
