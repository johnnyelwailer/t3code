import { useCallback } from "react";

import { useProjectDashboardModeState } from "~/t3team/hooks/t3team-useProjectDashboardModeState";
import { useProjectDashboardMyWorkState } from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectMyWorkLens } from "~/t3team/t3team-ProjectMyWorkViewSwitch";

/**
 * The dashboard header's one segmented control (Digest | List | Board | Backlog) over the two
 * states it spans: the dashboard mode (`?projectView=`) and the My Work lens (`?myWorkLens=`).
 * Each keeps its own persistence and URL contract; this only decides which of them a click writes,
 * so picking a lens from the Backlog also leaves the Backlog.
 */
export function useProjectDashboardViewTab(projectId: string) {
  const { state: modeState, setState: setModeState } = useProjectDashboardModeState(projectId);
  const { state: myWorkState, setState: setMyWorkState } =
    useProjectDashboardMyWorkState(projectId);
  const mode = modeState.dashboardMode;
  const lens = myWorkState.lens;

  const selectLens = useCallback(
    (next: ProjectMyWorkLens) => {
      if (next !== lens) setMyWorkState((current) => ({ ...current, lens: next }));
      if (mode !== "my-work") setModeState({ dashboardMode: "my-work" });
    },
    [lens, mode, setModeState, setMyWorkState],
  );
  const selectBacklog = useCallback(() => {
    if (mode !== "backlog") setModeState({ dashboardMode: "backlog" });
  }, [mode, setModeState]);

  return { mode, lens, selectLens, selectBacklog };
}
