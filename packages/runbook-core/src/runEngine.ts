import type { WorkflowReference } from "./engineTypes.ts";
import type { WorkflowEventSink } from "./events.ts";
import { WorkflowAborted, WorkflowError } from "./errors.ts";
import {
  createSuspensionLatch,
  WorkflowSuspended,
  type ArmedSuspension,
  type SuspensionLatch,
} from "./handles.ts";
import type { JournalMaps } from "./journalReader.ts";
import type { JournalStore, JournalSink } from "./journalStore.ts";
import { createStoreSink } from "./journalStore.ts";

export type RunOutcome<O = unknown> =
  | { readonly kind: "completed"; readonly output: O }
  | { readonly kind: "suspended"; readonly correlationId: string }
  | { readonly kind: "aborted" };

export interface ExecuteBodyRequest<Ref extends WorkflowReference, Options> {
  readonly runId: string;
  readonly ref: Ref;
  readonly args: unknown;
  readonly runsRoot: string;
  readonly store: JournalStore;
  readonly journal: JournalMaps;
  readonly sink: JournalSink;
  readonly options: Options;
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
 * Execute one body inside the generic durability barrier.
 *
 * The body may use any host-specific loader, tool catalog, or broker, but it receives the
 * already-loaded replay maps and one ordered sink. Core catches the identity-based durable
 * suspension signal and the first-class abort signal, and always flushes/disposes the sink
 * before returning an outcome.
 */
export async function executeWorkflowRun<Ref extends WorkflowReference, Options>(opts: {
  readonly runId: string;
  readonly ref: Ref;
  readonly args: unknown;
  readonly runsRoot: string;
  readonly store: JournalStore;
  readonly options: Options;
  readonly body: WorkflowBodyExecutor<Ref, Options>;
  readonly events?: WorkflowEventSink | undefined;
  readonly abortSignal?: AbortSignal | undefined;
}): Promise<RunOutcome> {
  const journal = await opts.store.readEntries(opts.runId);
  const sink = createStoreSink(opts.store, opts.runId);
  const suspension = createSuspensionLatch();
  try {
    const output = await opts.body({
      runId: opts.runId,
      ref: opts.ref,
      args: opts.args,
      runsRoot: opts.runsRoot,
      store: opts.store,
      journal,
      sink,
      options: opts.options,
      suspension,
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
