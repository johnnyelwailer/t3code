/**
 * t3code · GHE #208 · deterministic 4-state activity observations
 *
 * Pure mapper from provider runtime events to the coarse observations the
 * per-thread state machine reasons about. No inference, no LLM, no timers:
 * the same `ProviderService.streamEvents` source that already powers
 * `ProviderRuntimeIngestion` (the activity feed) decides the state word. This
 * module owns only the mapping; the state machine that consumes the
 * observations lives in `t3team-activityState.ts`.
 */

import { isToolLifecycleItemType, type ProviderRuntimeEvent } from "@t3tools/contracts";

/** A coarse, classification-relevant observation of one thread. */
export type ActivityStateEvent =
  | { readonly threadId: string; readonly type: "reasoning-delta" }
  | { readonly threadId: string; readonly type: "assistant-delta" }
  | { readonly threadId: string; readonly type: "tool-started" }
  | { readonly threadId: string; readonly type: "tool-completed" }
  | { readonly threadId: string; readonly type: "turn-started" }
  /** Output is arriving but it is not a state boundary (tool streams, plan text): extends the idle gap only. */
  | { readonly threadId: string; readonly type: "output" }
  /** Blocked on a user decision (approval / user input): drop the state. */
  | { readonly threadId: string; readonly type: "input-requested" }
  /** The user decision was answered and the turn resumes: back to reasoning. */
  | { readonly threadId: string; readonly type: "input-resumed" }
  | { readonly threadId: string; readonly type: "turn-ended" };

/**
 * The content-delta stream kinds that mark model reasoning rather than
 * assistant text. Verified against the drivers:
 * - Claude: `reasoning_text` (thinking deltas), `assistant_text` otherwise
 * - Codex: `reasoning_text`, `reasoning_summary_text`
 * - OpenCode: `reasoning_text` (reasoning parts), `assistant_text` otherwise
 * - Cursor / Grok: no reasoning stream kind at all — `thinking` simply never
 *   fires for those threads (documented, acceptable gap)
 */
const REASONING_STREAM_KINDS: ReadonlySet<string> = new Set([
  "reasoning_text",
  "reasoning_summary_text",
]);

/**
 * Map one provider runtime event onto a coarse classifier observation. Returns
 * null for events that are not state-relevant (usage, auth, account, mcp, …).
 *
 * `streamKind`/`itemType` are provider-neutral contract markers, so this
 * mapper stays vendor-agnostic: the `thinking` state only fires when the
 * driver actually emits reasoning content (Claude SDK thinking deltas, Codex
 * `item/reasoning/*` deltas, OpenCode thinking parts).
 */
export function runtimeEventToActivityStateEvent(
  event: ProviderRuntimeEvent,
): ActivityStateEvent | null {
  const threadId = event.threadId;
  switch (event.type) {
    case "content.delta": {
      const { streamKind } = event.payload;
      if (streamKind !== undefined && REASONING_STREAM_KINDS.has(streamKind)) {
        return { threadId, type: "reasoning-delta" };
      }
      if (streamKind === "assistant_text") {
        return { threadId, type: "assistant-delta" };
      }
      // Tool streams / plan text: output arrived (extends the idle gap) but is
      // not a state boundary.
      return { threadId, type: "output" };
    }
    case "item.started": {
      const { itemType } = event.payload;
      if (isToolLifecycleItemType(itemType)) return { threadId, type: "tool-started" };
      if (itemType === "reasoning") return { threadId, type: "reasoning-delta" };
      if (itemType === "assistant_message") return { threadId, type: "assistant-delta" };
      return null;
    }
    case "item.completed": {
      const { itemType } = event.payload;
      if (isToolLifecycleItemType(itemType)) return { threadId, type: "tool-completed" };
      return null;
    }
    case "item.updated": {
      return isToolLifecycleItemType(event.payload.itemType) ? { threadId, type: "output" } : null;
    }
    case "tool.progress":
      return { threadId, type: "output" };
    case "turn.started":
      return { threadId, type: "turn-started" };
    case "turn.completed":
    case "turn.aborted":
    case "session.exited":
      return { threadId, type: "turn-ended" };
    case "request.opened":
    case "user-input.requested":
      return { threadId, type: "input-requested" };
    case "request.resolved":
    case "user-input.resolved":
      return { threadId, type: "input-resumed" };
    default:
      return null;
  }
}
