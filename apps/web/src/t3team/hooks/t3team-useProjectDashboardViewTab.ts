import { useCallback } from "react";

import { useProjectDashboardBacklogViewMode } from "~/t3team/hooks/t3team-useProjectDashboardBacklogViewMode";
import { useProjectDashboardModeState } from "~/t3team/hooks/t3team-useProjectDashboardModeState";
import { projectBacklogViewModes } from "~/t3team/t3team-projectBacklogPresentation";
import { useProjectDashboardMyWorkState } from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectMyWorkLens } from "~/t3team/t3team-ProjectMyWorkViewSwitch";

/**
 * The dashboard header's one segmented control (Digest | List | Board | Backlog | Planning) over
 * the states it spans: the dashboard mode (`?projectView=`), the My Work lens (`?myWorkLens=`) and
 * the backlog's view mode (`?view=`). Each keeps its own persistence and URL contract; this only
 * decides which of them a click writes, so picking a lens from the Backlog also leaves the Backlog.
 *
 * Planning is the Backlog in its planning-space view mode, not a route of its own: it is active
 * when the dashboard is on the Backlog AND that view mode is `planning-space`, and Backlog is then
 * the same dashboard in any other view mode.
 */
export function useProjectDashboardViewTab(projectId: string) {
  const { state: modeState, setState: setModeState } = useProjectDashboardModeState(projectId);
  const { state: myWorkState, setState: setMyWorkState } =
    useProjectDashboardMyWorkState(projectId);
  const { viewMode: backlogViewMode, setViewMode: setBacklogViewMode } =
    useProjectDashboardBacklogViewMode(projectId);
  const mode = modeState.dashboardMode;
  const lens = myWorkState.lens;
  const onBacklog = mode === "backlog";
  // Behind the same flag as the planning-space view mode itself (and its options-menu entry).
  const planningActive = onBacklog && backlogViewMode === "planning-space";
  const backlogActive = onBacklog && !planningActive;

  const selectLens = useCallback(
    (next: ProjectMyWorkLens) => {
      if (next !== lens) setMyWorkState((current) => ({ ...current, lens: next }));
      if (mode !== "my-work") setModeState({ dashboardMode: "my-work" });
    },
    [lens, mode, setModeState, setMyWorkState],
  );
  const selectBacklog = useCallback(() => {
    // From the planning space, Backlog means the backlog's default view (the table).
    if (backlogViewMode === "planning-space") {
      setBacklogViewMode(projectBacklogViewModes[0]?.value ?? "table");
    }
    if (mode !== "backlog") setModeState({ dashboardMode: "backlog" });
  }, [backlogViewMode, mode, setBacklogViewMode, setModeState]);
  const selectPlanning = useCallback(() => {
    if (backlogViewMode !== "planning-space") setBacklogViewMode("planning-space");
    if (mode !== "backlog") setModeState({ dashboardMode: "backlog" });
  }, [backlogViewMode, mode, setBacklogViewMode, setModeState]);

  return {
    mode,
    lens,
    backlogActive,
    planningActive,
    selectLens,
    selectBacklog,
    selectPlanning,
  };
}
