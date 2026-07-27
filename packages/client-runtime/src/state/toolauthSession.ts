import type { ToolAuthState, ToolAuthStreamEvent } from "@t3tools/contracts";

/** Latest known state per tool id (`claude`, `codex`, ...). */
export type ToolAuthStatesByTool = ReadonlyMap<string, ToolAuthState>;

export const EMPTY_TOOLAUTH_STATES: ToolAuthStatesByTool = new Map();

/**
 * Folds `subscribeToolAuth`'s stream into a per-tool state map. The first
 * event is always a full `snapshot` (replaces the map outright); every event
 * after that is an `update` for one tool.
 */
export function applyToolAuthStreamEvent(
  current: ToolAuthStatesByTool,
  event: ToolAuthStreamEvent,
): ToolAuthStatesByTool {
  if (event.type === "snapshot") {
    return new Map(event.tools.map((state) => [state.tool, state]));
  }
  const next = new Map(current);
  next.set(event.state.tool, event.state);
  return next;
}
