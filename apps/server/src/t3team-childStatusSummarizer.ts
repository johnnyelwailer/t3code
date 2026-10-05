/**
 * Background child-status summaries (pure helpers + debounced generation).
 *
 * A subagent child's recent finished tool work (V2 turn items) is condensed by
 * a structured text-generation call into a 3–96 character status line that the
 * parent's UI shows next to the child. It is a fork thread fact (`childStatus`),
 * never a chat message: nothing here dispatches a command or wakes an agent.
 * Generation is debounced per thread and generation-numbered, so a burst of
 * items produces one call and a stale answer never overwrites a newer one.
 * @module t3team-childStatusSummarizer
 */
import type { ModelSelection, OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

export interface ChildActivity {
  readonly itemId: string;
  readonly kind: string;
  readonly summary: string;
}

const RECENT_ACTIVITY_LIMIT = 8;
const SUMMARY_MAX = 160;
const FINISHED: ReadonlySet<string> = new Set(["completed", "failed"]);

const compact = (text: string) => text.replaceAll(/\s+/g, " ").trim().slice(0, SUMMARY_MAX);

/** The meaningful, finished work a turn item records; null for anything else. */
export function turnItemActivity(item: OrchestrationV2TurnItem): ChildActivity | null {
  if (!FINISHED.has(item.status)) return null;
  const summary = (() => {
    switch (item.type) {
      case "command_execution":
        return item.title ?? item.input;
      case "file_change":
        return `${item.status === "failed" ? "failed to change" : "changed"} ${item.fileName}`;
      case "file_search":
        return item.title ?? item.pattern ?? null;
      case "web_search":
        return item.title ?? item.patterns?.join(", ") ?? null;
      case "dynamic_tool":
        return item.title ?? item.toolName;
      case "assistant_message":
        return item.streaming ? null : item.text;
      default:
        return null;
    }
  })();
  if (summary === null || compact(summary).length === 0) return null;
  return { itemId: item.id, kind: item.type, summary: compact(summary) };
}

/** Appends (or refreshes) one item, keeping the latest RECENT_ACTIVITY_LIMIT distinct items. */
export const appendRecentActivity = (
  recent: ReadonlyArray<ChildActivity>,
  next: ChildActivity,
): ReadonlyArray<ChildActivity> =>
  [...recent.filter((entry) => entry.itemId !== next.itemId), next].slice(-RECENT_ACTIVITY_LIMIT);

export const parseChildStatus = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = (value as { status?: unknown }).status;
  if (typeof status !== "string") return null;
  const normalized = status.replaceAll(/\s+/g, " ").trim();
  return normalized.length >= 3 &&
    normalized.length <= 96 &&
    !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
};

export const childStatusPrompt = (activity: ReadonlyArray<ChildActivity>) =>
  [
    'Summarize the child agent\'s current work as JSON: {"status":"..."}.',
    "Use 3-96 plain-text characters, present tense, specific and concise.",
    "Do not mention models, prompts, tools, agents, or internal runtime details.",
    "Recent activity (oldest first):",
    ...activity.map((entry) => `- ${entry.kind}: ${entry.summary}`),
  ].join("\n");

export interface ChildStatusNote {
  readonly threadId: string;
  readonly modelSelection: ModelSelection;
  readonly activity: ReadonlyArray<ChildActivity>;
}

/**
 * Debounced, generation-numbered summarizer. `note` restarts the thread's
 * debounce; when it fires, the latest activity is summarized and persisted
 * unless a newer note arrived meanwhile. Failures are the caller's to log.
 */
export const makeChildStatusSummarizer = Effect.fn("t3team.childStatus.makeSummarizer")(function* <
  E1,
  E2,
>(deps: {
  readonly debounce: Duration.Input;
  readonly generate: (note: ChildStatusNote) => Effect.Effect<unknown, E1>;
  readonly persist: (threadId: string, status: string) => Effect.Effect<void, E2>;
  readonly onFailure: (threadId: string, error: E1 | E2) => Effect.Effect<void>;
}) {
  const scope = yield* Effect.scope;
  const pending = new Map<string, { generation: number; fiber: Fiber.Fiber<void> }>();

  const run = (note: ChildStatusNote, generation: number) =>
    Effect.gen(function* () {
      yield* Effect.sleep(deps.debounce);
      const status = parseChildStatus(yield* deps.generate(note));
      if (status === null || pending.get(note.threadId)?.generation !== generation) return;
      yield* deps.persist(note.threadId, status);
    }).pipe(
      Effect.catch((error) => deps.onFailure(note.threadId, error)),
      Effect.ensuring(
        Effect.sync(() => {
          if (pending.get(note.threadId)?.generation === generation) pending.delete(note.threadId);
        }),
      ),
    );

  const note = (input: ChildStatusNote) =>
    Effect.gen(function* () {
      const prior = pending.get(input.threadId);
      if (prior !== undefined) yield* Fiber.interrupt(prior.fiber);
      const generation = (prior?.generation ?? 0) + 1;
      const fiber = yield* Effect.forkIn(run(input, generation), scope);
      pending.set(input.threadId, { generation, fiber });
      return generation;
    });

  return { note };
});
