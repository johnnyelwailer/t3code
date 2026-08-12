/**
 * The message-broker seam (Epic 25 §The thread model — host wiring). The engine does NOT
 * deliver messages — the host does. A thread verb's `sent` entry fires `broker.send(envelope,
 * resolver)`; the host routes the envelope into orchestration and, when a reply lands, settles
 * it. Two settlement paths:
 *
 *   • Synchronous — the broker calls `resolver.resolve(reply)` inside `send`. The runtime
 *     appends the `resolved` journal entry immediately, so the same run sees the reply and
 *     never suspends. (This is what the mock broker uses, and what an in-process recipient
 *     would do.)
 *   • Out of band — the broker returns without resolving; the run suspends. When the reply
 *     arrives later (a turn completes, or the user posts a message) the host calls
 *     {@link appendResolvedEntry} to write the `resolved` line, then `resumeWorkflow`, which
 *     replays to the same `await` and finds it.
 *
 * {@link createInterceptingBroker} is a third broker: it lets a CALLER (not the host) answer some
 * kinds itself while every other kind still reaches the real host. This is the mechanism behind
 * `workflow()`'s handler-map parameter — a parent that hands a sub-workflow a mocked `user.input`
 * or a scripted `thread.turn` composes one of these over the run's real broker.
 *
 * The four thread verbs map onto orchestration: `thread.create` → dispatch(thread.create),
 * `thread.turn` → dispatch(thread.turn.start) (resolves on turn-done), `thread.message` →
 * dispatch(thread.message.upsert) (one-way), `user.input` → a system message requesting input
 * (resolves on the user's reply). One-way verbs never settle a resolver.
 */

import * as DateTime from "effect/DateTime";

import { WorkflowError } from "@runbook/core/errors";
import type { ReplyResolver } from "@runbook/core/handles";
import { FsJournalStore, type JournalStore } from "@runbook/core/journalStore";

/** The thread-verb primitives, as the broker sees them, plus the clock-driven `wait.until`: a
 * durable suspension fired through the broker like an ask, but woken by the host scheduler at
 * its journaled deadline rather than by an event. */
export type HandleKind =
  | "thread.create"
  | "thread.turn"
  | "thread.message"
  | "user.input"
  | "wait.until"
  | "model.resolve";

/** What the host is handed for one fired side effect. `payload` carries the verb's data —
 * always a `threadId`, plus `prompt`/`question`/`text`/`name`/`model` per kind. */
export interface MessageEnvelope {
  readonly correlationId: string;
  readonly kind: HandleKind;
  readonly payload: unknown;
}

/** The host-provided delivery seam, injected via `WorkflowRunOptions.broker`. */
export interface MessageBroker {
  send(envelope: MessageEnvelope, resolver: ReplyResolver): Promise<void>;
}

/** The decision a {@link createMockBroker} test broker makes for each fired envelope. */
export type MockBrokerOutcome =
  | { readonly kind: "resolve"; readonly reply: unknown }
  | { readonly kind: "defer" }
  | { readonly kind: "reject" };

export interface MockBroker extends MessageBroker {
  /** Every envelope the broker has seen, in send order (for test assertions). */
  readonly sent: MessageEnvelope[];
}

/**
 * A test broker. `decide` inspects each envelope and chooses to resolve synchronously
 * (body gets the reply, no suspend), defer (body suspends → `SuspendedResult`), or reject
 * (the response rejects). Records every envelope in `sent`.
 */
export function createMockBroker(
  decide: (envelope: MessageEnvelope) => MockBrokerOutcome,
): MockBroker {
  const sent: MessageEnvelope[] = [];
  return {
    sent,
    send: async (envelope, resolver) => {
      sent.push(envelope);
      const outcome = decide(envelope);
      if (outcome.kind === "resolve") resolver.resolve(outcome.reply);
      else if (outcome.kind === "reject") resolver.reject();
      // "defer" → leave it pending → an ask verb suspends on `await`.
    },
  };
}

/**
 * One caller-declared answer for an intercepted {@link HandleKind}. `by` is not decoration: it
 * is written into the fired reply's `resolved` journal entry as provenance (see
 * `handlesDispatch.ts`'s `recordResolved`), so a reader — or a resumed run — can tell "the parent
 * answered this" apart from "the real host answered this" after the fact. There is deliberately
 * no per-call opt-out flag alongside it (an earlier design's `askUser(q, { requiresHuman: true
 * })` was rejected for exactly that "flag opting out of an opt-in mechanism" smell): the contract
 * lives here, at the invocation boundary, once — a composer that must not intercept a kind simply
 * omits it from `handlers`.
 */
export interface InterceptHandler {
  readonly by: string;
  readonly handle: (envelope: MessageEnvelope) => Promise<unknown>;
}

/** A partial map of {@link InterceptHandler}s, one slot per {@link HandleKind}. Every kind is
 * covered uniformly here — `user.input` is not special-cased over `thread.turn` or the rest;
 * whether a real host would treat them differently is a host-wiring concern, not this seam's. */
export type InterceptHandlers = { readonly [K in HandleKind]?: InterceptHandler };

/**
 * Compose a broker that consults `handlers` for each fired envelope and falls through to
 * `parent`, UNCHANGED, for every kind the caller did not declare. This is deliberately the whole
 * mechanism — no special-casing lives in the dispatch path (`handlesDispatch.ts`) or in any
 * individual thread verb, because the seam a real host answers through (`MessageBroker.send`) is
 * already the one thing every kind funnels through. A caller that wants to answer a child
 * sub-workflow's `user.input` (or supply its `thread.turn` result, the deterministic-testing
 * case) builds one of these over the run's real broker and hands it to that one child.
 *
 * A handler's `handle` resolves SYNCHRONOUSLY from this broker's point of view — same shape as
 * {@link createMockBroker}'s "resolve" outcome, so an intercepted kind never suspends the run.
 * `handle` rejecting is NOT caught here: the rejection propagates out of `send`, through the
 * dispatch's `call.fire`, and surfaces at the body's `await` as a real error. There is no silent
 * fallthrough to `parent` on failure — a handler that cannot answer must throw, not defer.
 */
export function createInterceptingBroker(
  parent: MessageBroker,
  handlers: InterceptHandlers,
): MessageBroker {
  return {
    send: async (envelope, resolver) => {
      const handler = handlers[envelope.kind];
      if (handler === undefined) return parent.send(envelope, resolver);
      const reply = await handler.handle(envelope);
      resolver.resolve(reply, { by: handler.by });
    },
  };
}

/**
 * Host delivery handlers, one per thread kind. A handler FIRES the side effect into
 * orchestration and returns — it does NOT settle an ask reply here. Ask replies arrive out of
 * band: when a turn completes or the user replies, the host calls {@link appendResolvedEntry}
 * + `resumeWorkflow`. One-way verbs (`thread.create` / `thread.message`) have no reply. An
 * unhandled kind is a no-op fire (that surface is not wired in this runtime).
 */
export interface HostBrokerHandlers {
  readonly "thread.create"?: (envelope: MessageEnvelope) => Promise<void>;
  readonly "thread.turn"?: (envelope: MessageEnvelope) => Promise<void>;
  readonly "thread.message"?: (envelope: MessageEnvelope) => Promise<void>;
  readonly "user.input"?: (envelope: MessageEnvelope) => Promise<void>;
  /** Record the run's wake deadline with the host scheduler; no reply settled here —
   * the scheduler appends the resolved entry when the clock reaches the deadline. */
  readonly "wait.until"?: (envelope: MessageEnvelope) => Promise<void>;
  /** Walk a model cascade against the live provider registry. UNLIKE the others this handler MUST
   * settle the resolver itself — the choice IS the primitive's journaled reply. */
  readonly "model.resolve"?: (e: MessageEnvelope, r: ReplyResolver) => Promise<void>;
}

/**
 * The real broker: route each envelope to its host handler and return. The `resolver` is
 * intentionally unused — synchronous resolution is the mock/in-process path; a real host
 * settles ask replies out of band via {@link appendResolvedEntry}.
 */
export function createHostBroker(handlers: HostBrokerHandlers): MessageBroker {
  return {
    send: async (envelope, resolver) => {
      // `model.resolve` settles its own reply (the cascade choice IS the journaled reply), so it
      // gets the resolver; an absent handler is netted by `createModelCascadeResolver`.
      if (envelope.kind === "model.resolve") return handlers["model.resolve"]?.(envelope, resolver);
      await handlers[envelope.kind]?.(envelope);
    },
  };
}

function brokerNowIso(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

/**
 * Host helper: append a `resolved` journal entry for a parked run when an external reply
 * lands, then the host calls `resumeWorkflow`. First-write-wins — returns `false` if the
 * correlation is already settled (a late reply after a dismissal or earlier resolution).
 *
 * Writes through a {@link JournalStore}: pass the host's store so the reply lands in the same
 * durable medium as the rest of the journal; absent one, it uses the filesystem store at the
 * supplied `runsRoot` or the package-local `.runbook-runs` default.
 */
export async function appendResolvedEntry(opts: {
  readonly store?: JournalStore;
  readonly runsRoot?: string;
  readonly runId: string;
  readonly correlationId: string;
  readonly reply: unknown;
  readonly nowIso?: () => string;
}): Promise<boolean> {
  const store = opts.store ?? new FsJournalStore(opts.runsRoot ?? ".runbook-runs");
  const { bySeq, byCorrelation } = await store.readEntries(opts.runId);
  if (byCorrelation.has(opts.correlationId)) return false;
  const sent = [...bySeq.values()].find(
    (entry) => entry.phase === "sent" && entry.correlationId === opts.correlationId,
  );
  if (sent === undefined) {
    throw new WorkflowError(
      `Cannot resolve correlationId '${opts.correlationId}': no matching 'sent' entry in run '${opts.runId}'. The reply has no open handle to settle.`,
    );
  }
  const ts = (opts.nowIso ?? brokerNowIso)();
  await store.appendResolved(opts.runId, {
    correlationId: opts.correlationId,
    kind: sent.kind,
    refId: sent.refId,
    reply: opts.reply,
    startedAt: ts,
    endedAt: ts,
  });
  return true;
}
