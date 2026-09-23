import type { WorkflowReference } from "./engineTypes.ts";
import type { WorkflowEventSink } from "./events.ts";
import { WorkflowAborted, WorkflowError } from "./errors.ts";
import {
  createRefireTarget,
  createSuspensionLatch,
  REFIRABLE_ASK_KINDS,
  WorkflowSuspended,
  type ArmedSuspension,
  type RefireTarget,
  type SuspensionLatch,
} from "./handles.ts";
import type { JournalMaps } from "./journalReader.ts";
import type { CheckpointRecord, ReplayWindow } from "./checkpoint.ts";
import type { JournalStore, JournalSink } from "./journalStore.ts";
import { createStoreSink } from "./journalStore.ts";

/** Read the checkpoint window; a store that reports an unsafe window (an unsettled resolvable
 * ask in the collapsed prefix) must not be resumed into — fail loud instead of skipping it. */
async function readReplayWindowChecked(
  readWindow: (runId: string) => Promise<ReplayWindow>,
  runId: string,
): Promise<{ readonly journal: JournalMaps; readonly resume: RunResume | undefined }> {
  const window = await readWindow(runId);
  if (window.unresolvedPrefixCorrelationIds.length > 0) {
    throw new WorkflowError(
      `Run '${runId}' cannot resume from checkpoint: the collapsed prefix still holds ${window.unresolvedPrefixCorrelationIds.length} unanswered ask(s) (${window.unresolvedPrefixCorrelationIds.join(", ")}). Checkpointing over an unsettled ask is unsafe; resume the run without the checkpoint window instead.`,
    );
  }
  return {
    journal: window.entries,
    resume:
      window.checkpoint === undefined
        ? undefined
        : { fromSeq: window.checkpoint.seq, checkpoint: window.checkpoint.record },
  };
}

export type RunOutcome<O = unknown> =
  | { readonly kind: "completed"; readonly output: O }
  | { readonly kind: "suspended"; readonly correlationId: string }
  | { readonly kind: "aborted" };

/** The checkpoint a resume restores: the boundary seq seeds the runtime's seq counter. */
export interface RunResume {
  readonly fromSeq: number;
  readonly checkpoint: CheckpointRecord;
}

export interface ExecuteBodyRequest<Ref extends WorkflowReference, Options> {
  readonly runId: string;
  readonly ref: Ref;
  readonly args: unknown;
  readonly runsRoot: string;
  readonly store: JournalStore;
  readonly journal: JournalMaps;
  readonly sink: JournalSink;
  readonly options: Options;
  /**
   * Present when the store read this run through its checkpoint-aware replay window: the body
   * re-drives from the boundary ({@link RunResume.fromSeq} seeds the seq counter) and the compact
   * state is available to the host so a checkpoint-aware body can restore its carried state.
   * Absent on a fresh start or a full-replay resume.
   */
  readonly resume?: RunResume | undefined;
  /** Live lifecycle observations; forward to the durable runtime so it emits primitive events. */
  readonly events?: WorkflowEventSink;
  /** Host abort signal; the executor/broker checks it and throws {@link WorkflowAborted}. */
  readonly abortSignal?: AbortSignal;
  /**
   * This run's suspension latch. Hand it to the durable runtime so the runtime and this boundary
   * share ONE record of "the run has suspended" — that shared record is what stops a body which
   * caught the suspension signal from completing the run with a fabricated value.
   */
  readonly suspension: SuspensionLatch;
  /**
   * Present only when the host asked this resume to re-fire one recorded, unanswered ask. Hand it
   * to the durable runtime (like {@link suspension}): the runtime consumes it at the target's seq,
   * and this boundary fails the run if the body returns or parks without having done so.
   */
  readonly refire?: RefireTarget | undefined;
}

/** Host-specific body loading, capability binding, and execution behind the core run loop. */
export type WorkflowBodyExecutor<Ref extends WorkflowReference, Options> = (
  request: ExecuteBodyRequest<Ref, Options>,
) => Promise<unknown>;

/**
 * Turn an armed suspension into this run's outcome. A normal ask parks the run at its
 * correlationId. A black-boxed one cannot: `parallel()`/`pipeline()` do not journal their nested
 * sends, so no `sent` entry exists for a host to settle and no resume could ever line up — that is
 * a host/authoring fault, and saying so beats parking forever or (as before this check existed)
 * handing the body `null` for a branch that never answered.
 */
function outcomeForArmedSuspension(armed: ArmedSuspension): RunOutcome {
  if (!armed.blackBoxed) return { kind: "suspended", correlationId: armed.correlationId };
  throw new WorkflowError(
    `A durable ask suspended inside parallel()/pipeline() (correlationId '${armed.correlationId}'). ` +
      `Composition branches are a journaling black box: the ask has no 'sent' entry, so the reply ` +
      `has no handle to settle and the run could never resume. Either the host must settle ` +
      `composition asks live (resolve the reply inside broker.send before it returns), or the ask ` +
      `must move out of the composition — await it sequentially, or run that step as a workflow().`,
  );
}

/**
 * Validate a requested re-fire against the journal BEFORE the body runs, so a stale, mistyped or
 * unsafe target fails before any live side effect: it must name a recorded `sent` entry of an
 * ask kind ({@link REFIRABLE_ASK_KINDS}) with no reply.
 */
function refireTargetFor(
  runId: string,
  journal: JournalMaps,
  correlationId: string | undefined,
): RefireTarget | undefined {
  if (correlationId === undefined) return undefined;
  const refuse = (why: string) =>
    new WorkflowError(`Run '${runId}' cannot re-fire ask '${correlationId}': ${why}`);
  // Replies first: `byCorrelation` is the FULL map even behind a checkpoint, while `bySeq` is only
  // the retained suffix — so an answered ask compacted away still gets its true reason here. (An
  // UNanswered compacted ask never gets this far: the replay window refuses to resume past it.)
  if (journal.byCorrelation.has(correlationId)) {
    throw refuse("it already has a journaled reply; resume without refire to replay it.");
  }
  const sent = Array.from(journal.bySeq.values()).find(
    (entry) => entry.phase === "sent" && entry.correlationId === correlationId,
  );
  if (sent === undefined) throw refuse("the journal has no recorded ask with that correlationId.");
  if (!REFIRABLE_ASK_KINDS.has(sent.kind)) {
    throw refuse(
      `it is a '${sent.kind}' entry; only ${[...REFIRABLE_ASK_KINDS].join(" / ")} asks can be re-sent (any other fire has side effects of its own, or awaits no reply).`,
    );
  }
  return createRefireTarget(correlationId);
}

/** Fail closed: a requested re-fire that the replay never reached must not park or complete. */
function assertRefireConsumed(
  runId: string,
  refire: RefireTarget | undefined,
  outcome: RunOutcome,
) {
  if (refire === undefined || refire.consumed() || outcome.kind === "aborted") return;
  throw new WorkflowError(
    `Run '${runId}' ${outcome.kind === "completed" ? "completed" : `parked on '${outcome.correlationId}'`} without reaching its re-fire target '${refire.correlationId}'. The replay took a different path than the journal recorded; nothing was re-sent.`,
  );
}

export interface ExecuteWorkflowRunRequest<Ref extends WorkflowReference, Options> {
  readonly runId: string;
  readonly ref: Ref;
  readonly args: unknown;
  readonly runsRoot: string;
  readonly store: JournalStore;
  readonly options: Options;
  readonly body: WorkflowBodyExecutor<Ref, Options>;
  readonly events?: WorkflowEventSink | undefined;
  readonly abortSignal?: AbortSignal | undefined;
  /** Correlation id of one recorded, unanswered ask to re-send (see `WorkflowRunOptionsBase`). */
  readonly refire?: string | undefined;
}

/**
 * Execute one body inside the generic durability barrier.
 *
 * The body may use any host-specific loader, tool catalog, or broker, but it receives the
 * already-loaded replay maps and one ordered sink. Core catches the identity-based durable
 * suspension signal and the first-class abort signal, and always flushes/disposes the sink
 * before returning an outcome. A requested re-fire is checked against the journal before the body
 * runs, and must have been consumed by the time the body returns or parks.
 */
export async function executeWorkflowRun<Ref extends WorkflowReference, Options>(
  opts: ExecuteWorkflowRunRequest<Ref, Options>,
): Promise<RunOutcome> {
  const store = opts.store;
  const readWindow = store.readReplayWindow;
  const window: { readonly journal: JournalMaps; readonly resume: RunResume | undefined } =
    typeof readWindow === "function"
      ? await readReplayWindowChecked(readWindow.bind(store), opts.runId)
      : { journal: await store.readEntries(opts.runId), resume: undefined };
  const refire = refireTargetFor(opts.runId, window.journal, opts.refire);
  const outcome = await executeBodyOnce(opts, window, refire);
  assertRefireConsumed(opts.runId, refire, outcome);
  return outcome;
}

async function executeBodyOnce<Ref extends WorkflowReference, Options>(
  opts: ExecuteWorkflowRunRequest<Ref, Options>,
  window: { readonly journal: JournalMaps; readonly resume: RunResume | undefined },
  refire: RefireTarget | undefined,
): Promise<RunOutcome> {
  const sink = createStoreSink(opts.store, opts.runId);
  const suspension = createSuspensionLatch();
  try {
    const output = await opts.body({
      runId: opts.runId,
      ref: opts.ref,
      args: opts.args,
      runsRoot: opts.runsRoot,
      store: opts.store,
      journal: window.journal,
      sink,
      options: opts.options,
      suspension,
      ...(refire === undefined ? {} : { refire }),
      ...(window.resume === undefined ? {} : { resume: window.resume }),
      ...(opts.events === undefined ? {} : { events: opts.events }),
      ...(opts.abortSignal === undefined ? {} : { abortSignal: opts.abortSignal }),
    });
    // The body returned a value while the run is suspended — it caught the suspension signal (a
    // bare `catch (e)` around an `agent()` does exactly this) and carried on. That value describes
    // an ask that never answered, so it must NEVER become the run's output.
    const swallowed = suspension.armed();
    if (swallowed !== undefined) return outcomeForArmedSuspension(swallowed);
    return { kind: "completed", output };
  } catch (error) {
    if (error instanceof WorkflowSuspended) {
      // Prefer the latch: it holds the FIRST suspension, and knows whether it is resumable.
      const armed = suspension.armed();
      if (armed !== undefined) return outcomeForArmedSuspension(armed);
      return { kind: "suspended", correlationId: error.correlationId };
    }
    if (error instanceof WorkflowAborted) {
      return { kind: "aborted" };
    }
    throw error;
  } finally {
    await sink.flush();
    sink.dispose();
  }
}
