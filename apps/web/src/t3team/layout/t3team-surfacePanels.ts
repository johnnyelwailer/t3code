/**
 * The fork's shared workspace panels. The data here is the single source of truth for the
 * My Work panel's ref and for which panel keys are session-scoped: the right-panel store
 * drops the matching keys on persistence and never restores them, so a restart shows the
 * list/home, never last session's tabs and detail fetches.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";

import { type T3TeamForkSurfaceParams } from "./t3team-surfaceRegistry";

/** The `t3team`-namespace kind of My Work's shared aside. */
export const T3_TEAM_MY_WORK_PANEL_KIND = "t3team.my-work" as const;

/**
 * Fixed workspace-level ref for My Work's shared aside (project dashboard + all-projects
 * home). Same session-scoped rule as the pull-request list: restart must not restore
 * stale tabs.
 */
export const MY_WORK_PANEL_REF: ScopedThreadRef = scopeThreadRef(
  EnvironmentId.make("my-work-panel"),
  ThreadId.make("my-work-panel"),
);

/** The panel's stable registry id: its scoped thread key. */
export const T3_TEAM_MY_WORK_PANEL_ID = `${MY_WORK_PANEL_REF.environmentId}:${MY_WORK_PANEL_REF.threadId}`;

/**
 * The panel's serializable params. It is a singleton: there is exactly one My Work panel,
 * so params stay empty and the id never depends on them.
 */
export function t3TeamMyWorkPanelParams(raw: unknown): T3TeamForkSurfaceParams | null {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object") return null;
  return {};
}

/**
 * The thread ids of the session-scoped shared panels: the pull-request list and My Work's
 * shared aside. A stored key scoped to one of them is dropped on load.
 */
const T3_TEAM_SESSION_SCOPED_PANEL_THREAD_IDS = ["pull-requests-panel", "my-work-panel"] as const;

/** Whether a stored thread key names a session-scoped shared panel. */
export function isT3TeamSessionScopedPanelKey(threadKey: string): boolean {
  return T3_TEAM_SESSION_SCOPED_PANEL_THREAD_IDS.some((threadId) =>
    threadKey.endsWith(`:${threadId}`),
  );
}
