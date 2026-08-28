/**
 * The Agents-panel sub-run dots reuse the state-motion DOT LANGUAGE that the
 * conversation working row uses (GHE #201 follow-up, now in production): each
 * dot carries ITS OWN state on `data-t3team-state` and the motion + hue is keyed
 * off that attribute + the `--t3team-aci-i` per-dot index.
 *
 * The working row only ever renders dots for ACTIVE agents, so its vocabulary
 * (t3team-activeAgentsCore's `DotState`) stops at "settled". The Agents-panel
 * roster ALSO shows settled sub-runs — and the point of the roster is to read
 * each agent's OUTCOME at a glance — so this panel extends that same vocabulary
 * with two still result states: `done` → success · `error` → failure. The live
 * states are derived through the SHARED `deriveDotState` (read/analyze →
 * thinking, edit/write → writing, else working; waiting breathes), so the panel
 * and the working row never diverge stylistically.
 *
 * Kept DOM-free so the mapping is unit-testable
 * (t3team-agentsPanelDots.logic.test.ts).
 */
import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";

import { deriveDotState, type DotState } from "./t3team-activeAgentsCore";

/** The panel's full dot vocabulary = the shared five live states + the roster result states. */
export type PanelDotState = DotState | "done" | "error";

type DotInputs = {
  readonly status: RuntimeSubagent["status"];
  readonly progress?: string | null;
  readonly lastToolName?: string | null;
};

/**
 * Map a roster subagent onto the dot vocabulary.
 *
 * Settled/terminal agents read a still, color-coded result the user can read
 * without opening the row:
 *   completed   → done    (green)
 *   failed      → error   (red)
 *   idle        → settled (dim — resting / resumable)
 *   cancelled   → settled (dim — stopped)
 *   interrupted → settled (dim — stopped)
 * Live agents reuse the shared per-agent derivation so each reads ITS own nuance:
 *   waiting → waiting · pending/running → thinking | writing | working (by what
 *   the agent is doing), exactly as the working row derives it.
 */
export function panelDotState(agent: DotInputs): PanelDotState {
  switch (agent.status) {
    case "completed":
      return "done";
    case "failed":
      return "error";
    case "idle":
    case "cancelled":
    case "interrupted":
      return "settled";
    case "pending":
    case "running":
    case "waiting":
      return deriveDotState({
        label: agent.progress ?? agent.lastToolName ?? "",
        status: agent.status,
      });
  }
}

/** True when the dot is one of the animated (live) shared states, not a still result. */
export function panelDotIsLive(state: PanelDotState): boolean {
  return state === "thinking" || state === "writing" || state === "working" || state === "waiting";
}
