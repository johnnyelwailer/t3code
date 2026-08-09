import type { WorkflowReference } from "./engine.ts";
import { WorkflowSuspended } from "./handles.ts";
import type { JournalMaps } from "./journalReader.ts";
import type { JournalStore, JournalSink } from "./journalStore.ts";
import { createStoreSink } from "./journalStore.ts";

export type RunOutcome<O = unknown> =
  | { readonly kind: "completed"; readonly output: O }
  | { readonly kind: "suspended"; readonly correlationId: string };

export interface ExecuteBodyRequest<Ref extends WorkflowReference, Options> {
  readonly runId: string;
  readonly ref: Ref;
  readonly args: unknown;
  readonly runsRoot: string;
  readonly store: JournalStore;
  readonly journal: JournalMaps;
  readonly sink: JournalSink;
  readonly options: Options;
}

/** Host-specific body loading, capability binding, and execution behind the core run loop. */
export type WorkflowBodyExecutor<Ref extends WorkflowReference, Options> = (
  request: ExecuteBodyRequest<Ref, Options>,
) => Promise<unknown>;

/**
 * Execute one body inside the generic durability barrier.
 *
 * The body may use any host-specific loader, tool catalog, or broker, but it receives the
 * already-loaded replay maps and one ordered sink. Core catches only the identity-based durable
 * suspension signal and always flushes/disposes the sink before returning an outcome.
 */
export async function executeWorkflowRun<Ref extends WorkflowReference, Options>(opts: {
  readonly runId: string;
  readonly ref: Ref;
  readonly args: unknown;
  readonly runsRoot: string;
  readonly store: JournalStore;
  readonly options: Options;
  readonly body: WorkflowBodyExecutor<Ref, Options>;
}): Promise<RunOutcome> {
  const journal = await opts.store.readEntries(opts.runId);
  const sink = createStoreSink(opts.store, opts.runId);
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
    });
    return { kind: "completed", output };
  } catch (error) {
    if (error instanceof WorkflowSuspended) {
      return { kind: "suspended", correlationId: error.correlationId };
    }
    throw error;
  } finally {
    await sink.flush();
    sink.dispose();
  }
}
