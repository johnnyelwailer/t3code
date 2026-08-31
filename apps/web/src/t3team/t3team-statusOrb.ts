/**
 * GHE #201 follow-up — status-dot → porcelain-orb state mapping.
 *
 * The shared production module's TS half: t3team-statusOrb.css owns the
 * porcelain-orb paint + color-shift logic (the final-captured Storybook
 * direction — t3team-DotColorVariants variant D, commit b2b3e08b9), and this
 * helper maps a sidebar status pill onto that orb's state vocabulary so every
 * seam (working-row ACI dots, Agents-panel sub-run dots, sidebar thread rows)
 * stamps the SAME `t3team-orb` + `data-t3team-state` pair.
 *
 * The ACI seams already carry a DotState (t3team-activeAgentsCore's
 * deriveDotState); this mapping exists for the sidebar pills, whose
 * vocabulary is wider:
 *   - a live activity state word (GHE #208) maps 1:1 (thinking/writing/
 *     working/waiting) — it is the authoritative live state;
 *   - Working/Connecting/Monitoring/Running read as `working`;
 *   - Completed/Complete → `done`, Needs attention/Failed/Error → `error`
 *     (the two still result states the Agents-panel roster uses);
 *   - the "waiting on someone" pills (Pending Approval, Awaiting Input,
 *     Plan Ready, workflow Waiting-for-answer/agent) → `waiting` — the orb
 *     system's native read of "parked, not dead";
 *   - dormant pills (Queued, Scheduled, Paused, Stopped, Idle, Sleeping)
 *     → `settled` (dim).
 *
 * `null` = outside the orb vocabulary: the seam keeps its legacy tailwind
 * dot class (fail-open, unknown labels never lose their color).
 */
import type { ActivityState } from "./t3team-activityStateDisplay";

/** The orb's full state vocabulary: the five live ACI states + the two
 *  still result states (t3team-agentsPanelDots.logic's PanelDotState). */
export type StatusOrbState =
  | "thinking"
  | "writing"
  | "working"
  | "waiting"
  | "settled"
  | "done"
  | "error";

/** Shared class stamped on the orb element (see t3team-statusOrb.css). */
export const STATUS_ORB_CLASS = "t3team-orb";

export function resolveStatusOrbState(
  pill:
    | {
        readonly label: string;
        readonly activityState?: ActivityState | null;
      }
    | null
    | undefined,
): StatusOrbState | null {
  if (pill === null || pill === undefined) return null;

  // The deterministic state word (GHE #208) is the authoritative live state
  // when present — it already IS a DotState.
  const activity = pill.activityState;
  if (activity !== undefined && activity !== null) return activity;

  switch (pill.label) {
    case "Completed":
    case "Complete":
      return "done";
    case "Needs attention":
    case "Failed":
    case "Error":
      return "error";
    case "Pending Approval":
    case "Awaiting Input":
    case "Plan Ready":
    case "Waiting for your answer":
    case "Waiting for agent":
      return "waiting";
    case "Working":
    case "Connecting":
    case "Monitoring":
    case "Running":
      return "working";
    case "Queued":
    case "Scheduled":
    case "Paused":
    case "Stopped":
    case "Idle":
    case "Sleeping":
      return "settled";
    default:
      return null;
  }
}
