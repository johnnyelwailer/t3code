/**
 * Which text an `askAgent` (`thread.turn`) ask resolves with — the per-thread turn watch behind
 * `t3team-workflowEngineReactor.ts`.
 *
 * THE BUG THIS EXISTS TO PREVENT: the reactor used to settle a `thread.turn` on the FIRST
 * complete assistant message it saw on the thread. A writer that narrates a plan ("I'll fetch
 * the context first…") or thinks aloud before doing the work therefore had its PREAMBLE captured
 * as the answer, silently, while the real turn kept running for minutes. A wrong-but-plausible
 * answer is worse than an error, so resolution now waits for the whole turn.
 *
 * ── The turn-end signal ─────────────────────────────────────────────────────
 * There is no `thread.turn-completed` domain event. The turn lifecycle reaches the domain stream
 * as `thread.session-set`: `ProviderRuntimeIngestion` maps the provider's `turn.started` to a
 * session with `activeTurnId` set (status `running`) and its `turn.completed` / `session.exited`
 * to `activeTurnId: null`. So "no turn is active on this thread any more" IS the turn-end signal,
 * and it is the same one the chat UI spins on.
 *
 * Two guards keep an unrelated session write from settling an ask:
 *   • an idle session must follow either an ACTIVE one (the turn really ran) or at least one
 *     completed assistant message — otherwise the `session.started` → `ready` write that lands
 *     right after the workflow dispatched its turn would resolve the ask before the agent spoke;
 *   • a dead session (`error` / `stopped`) always ends the wait: it can no longer answer, and
 *     parking the run forever would hide that.
 *
 * ── Which message is the answer ─────────────────────────────────────────────
 * The LAST substantive message of the turn, not the concatenation. A turn's messages are a
 * sequence of thoughts, plans, and tool narration that ends in the answer; concatenating them
 * would paste the narration INTO every caller's value (a description draft, a schema payload,
 * a commit message). Callers that want the reasoning have the thread itself. Empty markers and
 * whitespace-only messages never become candidates, so a turn that says nothing settles as
 * {@link WorkflowTurnSettlement} `"empty"` and the caller can fail loudly instead of proposing "".
 */

/** How long after the turn-end signal the answer is taken. */
export const WORKFLOW_TURN_SETTLE_MS = 250;

/** Session statuses that end the wait even if no turn was ever seen running. */
const DEAD_SESSION_STATUS: ReadonlySet<string> = new Set(["error", "stopped"]);

export type WorkflowTurnSessionNote = "running" | "ended" | "settling" | "pending";

export type WorkflowTurnSettlement =
  | { readonly kind: "answer"; readonly text: string }
  /** The turn ended without a single substantive assistant message. */
  | { readonly kind: "empty" }
  /** The watch belongs to a different (or already settled) ask — do nothing. */
  | { readonly kind: "stale" };

export interface WorkflowTurnSessionInput {
  readonly status: string;
  readonly activeTurnId: string | null;
}

export interface WorkflowTurnTracker {
  /** Buffer a streaming assistant delta; the reply text rides on the deltas, not the marker. */
  readonly appendDelta: (
    threadId: string,
    correlationId: string,
    messageId: string,
    delta: string,
  ) => void;
  /**
   * Record a finalized assistant message as a candidate answer. Never settles the ask.
   *
   * Returns the text retained as a candidate, so the caller can attribute THAT message without
   * re-deriving it, or `undefined` when the message said nothing substantive.
   */
  readonly completeMessage: (
    threadId: string,
    correlationId: string,
    messageId: string,
    markerText: string,
  ) => string | undefined;
  /** Fold a session write in; `"ended"` means the caller should arm the settle. */
  readonly noteSession: (
    threadId: string,
    correlationId: string,
    session: WorkflowTurnSessionInput,
  ) => WorkflowTurnSessionNote;
  /** Take the turn's answer, clearing the watch. Only valid after `"ended"`. */
  readonly take: (threadId: string, correlationId: string) => WorkflowTurnSettlement;
  /** Drop a thread's watch (ask settled elsewhere, run cancelled, turn interrupted). */
  readonly forget: (threadId: string) => void;
}

interface TurnWatch {
  correlationId: string;
  sawActiveTurn: boolean;
  ended: boolean;
  /** Assistant text assembled from `streaming: true` deltas, keyed by messageId. */
  readonly deltas: Map<string, string>;
  /** Finalized substantive assistant texts of this turn, in arrival order. */
  readonly candidates: string[];
}

export function createWorkflowTurnTracker(): WorkflowTurnTracker {
  const watches = new Map<string, TurnWatch>();

  // A new ask on the same thread starts a fresh watch: the previous turn's buffered text must
  // never leak into the next one's answer.
  const ensure = (threadId: string, correlationId: string): TurnWatch => {
    const existing = watches.get(threadId);
    if (existing !== undefined && existing.correlationId === correlationId) return existing;
    const watch: TurnWatch = {
      correlationId,
      sawActiveTurn: false,
      ended: false,
      deltas: new Map(),
      candidates: [],
    };
    watches.set(threadId, watch);
    return watch;
  };

  return {
    appendDelta: (threadId, correlationId, messageId, delta) => {
      const watch = ensure(threadId, correlationId);
      watch.deltas.set(messageId, (watch.deltas.get(messageId) ?? "") + delta);
    },

    completeMessage: (threadId, correlationId, messageId, markerText) => {
      const watch = ensure(threadId, correlationId);
      // The `streaming: false` marker carries `text: ""` (see the decider's
      // `thread.message.assistant.complete` case); the text is what the deltas assembled. The
      // marker's own text is only a fallback for a message upserted whole.
      const assembled = watch.deltas.get(messageId);
      watch.deltas.delete(messageId);
      const text = assembled ?? markerText;
      if (text.trim().length === 0) return undefined;
      watch.candidates.push(text);
      return text;
    },

    noteSession: (threadId, correlationId, session) => {
      const watch = ensure(threadId, correlationId);
      if (session.activeTurnId !== null) {
        watch.sawActiveTurn = true;
        return "running";
      }
      const endsTheWait =
        watch.sawActiveTurn ||
        watch.candidates.length > 0 ||
        DEAD_SESSION_STATUS.has(session.status);
      if (!endsTheWait) return "pending";
      if (watch.ended) return "settling";
      watch.ended = true;
      return "ended";
    },

    take: (threadId, correlationId) => {
      const watch = watches.get(threadId);
      if (watch === undefined || watch.correlationId !== correlationId) return { kind: "stale" };
      watches.delete(threadId);
      const answer = watch.candidates.at(-1);
      return answer === undefined ? { kind: "empty" } : { kind: "answer", text: answer };
    },

    forget: (threadId) => {
      watches.delete(threadId);
    },
  };
}
