/**
 * The message-broker seam (Epic 25.4 §The Handle pattern, Part 3). The engine does NOT
 * deliver messages — the host does. A handle's `sent` entry fires `broker.send(envelope,
 * resolver)`; the host routes the envelope into the recipient thread and, when a reply
 * lands, settles it. Two settlement paths:
 *
 *   • Synchronous — the broker calls `resolver.resolve(reply)` inside `send`. The runtime
 *     appends the `resolved` journal entry immediately, so the same run sees the reply and
 *     never suspends. (This is what the mock broker uses, and what an in-process recipient
 *     would do.)
 *   • Out of band — the broker returns without resolving; the run suspends. When the reply
 *     arrives later the host calls {@link appendResolvedEntry} to write the `resolved` line,
 *     then `resumeWorkflow`, which replays to the same `await` and finds it.
 *
 * Agents (non-workflow) get the fire-and-forget half only (see Epic 25 §Agents vs.
 * workflows): their `t3work.thread.send` maps to a broker `send` with no resolver wiring —
 * never the suspending workflow primitive.
 */

import * as DateTime from "effect/DateTime";

import { WorkflowError } from "./t3work-sdk.errors.ts";
import type { ReplyResolver } from "./t3work-sdk.handles.ts";
import { journalFilePath } from "./t3work-sdk.journal.ts";
import { readJournalEntries } from "./t3work-sdk.journalReader.ts";
import { JournalWriter } from "./t3work-sdk.journalWriter.ts";

/** The five Handle-firing primitives, as the broker sees them. */
export type HandleKind = "ui.show" | "thread.send" | "child.spawn" | "user.ask" | "user.notify";

/** A resolved `thread.send` target descriptor (the wire form of a `ThreadTarget`). */
export type ThreadTargetWire =
  | { readonly kind: "self" }
  | { readonly kind: "parent" }
  | { readonly kind: "thread"; readonly id: string }
  | { readonly kind: "child"; readonly id: string };

/** What the host is handed for one fired side effect. */
export interface MessageEnvelope {
  readonly correlationId: string;
  readonly kind: HandleKind;
  /** Present for `thread.send`; absent for ui/child/user. */
  readonly target?: ThreadTargetWire;
  readonly payload: unknown;
  /** Schema identity for ask-shaped calls (the response is validated against it). */
  readonly responseSchema?: unknown;
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
      // "defer" → leave it pending → the workflow suspends on `await handle.response`.
    },
  };
}

/**
 * Host delivery handlers, one per Handle kind. A handler FIRES the side effect into the
 * recipient and returns — it does NOT settle the reply here. Replies arrive out of band:
 * when one lands the host calls {@link appendResolvedEntry} + `resumeWorkflow`. This is the
 * real (non-mock) path. A host wires:
 *   • `child.spawn`  → the existing `t3work-toolBrokerStartChild` (`makeStartChildThread`);
 *   • `thread.send`  → the cross-thread message broker (Epic 16) — this is also the
 *     fire-and-forget surface an *agent's* `t3work.thread.send` maps onto (no suspension);
 *   • `ui.show` / `user.ask` / `user.notify` → the tiered-message / escalation surfaces.
 */
export interface HostBrokerHandlers {
  readonly "ui.show"?: (envelope: MessageEnvelope) => Promise<void>;
  readonly "thread.send"?: (envelope: MessageEnvelope) => Promise<void>;
  readonly "child.spawn"?: (envelope: MessageEnvelope) => Promise<void>;
  readonly "user.ask"?: (envelope: MessageEnvelope) => Promise<void>;
  readonly "user.notify"?: (envelope: MessageEnvelope) => Promise<void>;
}

/**
 * The real broker: route each envelope to its host handler and return. The `resolver` is
 * intentionally unused — synchronous resolution is the mock/in-process path; a real host
 * settles replies out of band via {@link appendResolvedEntry}. An unhandled kind is a no-op
 * fire (the recipient surface is not wired in this runtime).
 */
export function createHostBroker(handlers: HostBrokerHandlers): MessageBroker {
  return {
    send: async (envelope) => {
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
 */
export function appendResolvedEntry(opts: {
  readonly runsRoot: string;
  readonly runId: string;
  readonly correlationId: string;
  readonly reply: unknown;
  readonly nowIso?: () => string;
}): boolean {
  const journalPath = journalFilePath(opts.runsRoot, opts.runId);
  const { bySeq, byCorrelation } = readJournalEntries(journalPath);
  if (byCorrelation.has(opts.correlationId)) return false;
  const sent = [...bySeq.values()].find(
    (entry) => entry.phase === "sent" && entry.correlationId === opts.correlationId,
  );
  if (sent === undefined) {
    throw new WorkflowError(
      `Cannot resolve correlationId '${opts.correlationId}': no matching 'sent' entry in run '${opts.runId}'. The reply has no open handle to settle.`,
    );
  }
  const writer = new JournalWriter(journalPath);
  try {
    const ts = (opts.nowIso ?? brokerNowIso)();
    writer.appendResolved({
      correlationId: opts.correlationId,
      kind: sent.kind,
      refId: sent.refId,
      reply: opts.reply,
      startedAt: ts,
      endedAt: ts,
    });
  } finally {
    writer.dispose();
  }
  return true;
}
