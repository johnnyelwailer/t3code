import type { ActivityState } from "~/t3team/t3team-activityStateDisplay";

export type ProjectSortOrder = "updated_at" | "created_at";
export type ThreadSortOrder = "updated_at" | "created_at";

export type ThreadStatusPill = {
  label:
    | "Running"
    | "Waiting for agent"
    | "Waiting for your answer"
    | "Scheduled"
    | "Paused"
    | "Stopped"
    | "Complete"
    | "Needs attention"
    | "Queued"
    | "Working"
    | "Completed"
    | "Error"
    | "Idle"
    | "Sleeping";
  /** GHE #40: live LLM-generated "working on" phrase; rendered instead of `label`
   *  while the thread is active. `label` stays the stable status key. */
  activityLabel?: string;
  /** GHE #208: deterministic 4-state base word; rendered as the label word, with
   *  `activityLabel` (if any) appended as " · {detail}". */
  activityState?: ActivityState;
  /** Optional trailing context for the pill — the wake time for a `Sleeping` routine
   * ("until Mon 09:00"), shown after the label in its tooltip. */
  detail?: string;
  colorClass: string;
  dotClass: string;
  pulse: boolean;
  /** GHE #208: `waiting` uses the slower, shallower `animate-status-pulse-slow`. */
  pulseClass?: string;
};
