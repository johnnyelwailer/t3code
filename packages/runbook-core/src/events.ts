/**
 * Structured workflow lifecycle events (host-neutral).
 *
 * The journal is the source of truth; these events are LIVE observations of it. The engine
 * emits the run-level events; the durable runtime emits the primitive-level events on the
 * live execution path only (a replayed call does not re-emit, so a subscriber sees each real
 * transition exactly once per process lifetime). Hosts that need history read the journal
 * ({@link import("./status.ts").inspectRun}), not the event stream.
 */

export interface WorkflowEventBase {
  readonly runId: string;
  /** Host-formatted timestamp of the observation (the engine/runtime `nowIso`). */
  readonly at: string;
}

export type WorkflowEvent =
  | (WorkflowEventBase & {
      readonly type: "run.started";
      /** How this run began: a fresh start or a resume of a journaled run. */
      readonly startKind: "start" | "resume";
    })
  | (WorkflowEventBase & { readonly type: "run.completed" })
  | (WorkflowEventBase & { readonly type: "run.failed"; readonly error: string })
  | (WorkflowEventBase & { readonly type: "run.aborted" })
  | (WorkflowEventBase & {
      readonly type: "run.suspended";
      /** The pending handle correlation id the run is parked on. */
      readonly correlationId: string;
    })
  | (WorkflowEventBase & {
      readonly type: "primitive.started";
      readonly seq: number;
      readonly kind: string;
      readonly refId: string;
    })
  | (WorkflowEventBase & {
      readonly type: "primitive.completed";
      readonly seq: number;
      readonly kind: string;
      readonly refId: string;
    });

/** The subscription surface the engine and durable runtime emit into. */
export interface WorkflowEventSink {
  readonly on: (event: WorkflowEvent) => void;
}

/**
 * Emit into a sink, swallowing observer exceptions. The durable write has already happened (or
 * is about to) — a throwing observer must not turn a completed run into a failed one by
 * propagating into the settle funnel or the primitive seat. The journal and terminal marker
 * are the truth; observation is best-effort.
 */
export function emitSafe(events: WorkflowEventSink | undefined, event: WorkflowEvent): void {
  if (events === undefined) return;
  try {
    events.on(event);
  } catch {
    // Observer failures are non-durable by design.
  }
}

/** Per-type handlers; each is narrowed to its own event variant. */
export type WorkflowEventHandlers = {
  readonly [K in WorkflowEvent["type"]]?: (
    event: Extract<WorkflowEvent, { readonly type: K }>,
  ) => void;
};

/**
 * Build a sink from per-type handlers. Missing handlers are no-ops, so a host can subscribe
 * to only the transitions it cares about. Handler exceptions are swallowed at the emit site
 * ({@link emitSafe}) — a status hiccup in an observer can never fail or rewrite a run.
 */
export function createWorkflowEventSink(handlers: WorkflowEventHandlers): WorkflowEventSink {
  return {
    on: (event) => {
      // The mapped type narrows per key, but a union-keyed read does not — one cast keeps the
      // public handler signatures precise without a per-variant switch.
      const handler = handlers[event.type] as ((event: WorkflowEvent) => void) | undefined;
      if (handler !== undefined) handler(event);
    },
  };
}
