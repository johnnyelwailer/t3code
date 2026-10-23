/**
 * Which optional My Work lenses and backlog views the host's feature flags offer: the digest
 * (`MYWORK_DIGEST`), the board (`MYWORK_KANBAN`) and the planning space
 * (`WORKITEM_PLANNING_SPACE`). A saved or linked choice of a view that is off is read as the
 * always-available fallback and is never overwritten, so turning the flag back on restores it.
 */
import type { ProjectBacklogViewMode } from "~/t3team/t3team-projectBacklogPresentation";
import type { ProjectMyWorkLens } from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

export interface MyWorkViewFlags {
  readonly digest: boolean;
  readonly board: boolean;
  readonly planningSpace: boolean;
}

export function useMyWorkViewFlags(): MyWorkViewFlags {
  const digest = useFeatureFlag("MYWORK_DIGEST");
  const board = useFeatureFlag("MYWORK_KANBAN");
  const planningSpace = useFeatureFlag("WORKITEM_PLANNING_SPACE");
  return { digest, board, planningSpace };
}

export function isMyWorkLensOffered(lens: ProjectMyWorkLens, flags: MyWorkViewFlags): boolean {
  if (lens === "digest") return flags.digest;
  if (lens === "board") return flags.board;
  return true;
}

/** The List lens has no flag: it is where a lens that is off lands. */
export function offeredMyWorkLens(
  lens: ProjectMyWorkLens,
  flags: MyWorkViewFlags,
): ProjectMyWorkLens {
  return isMyWorkLensOffered(lens, flags) ? lens : "hierarchy";
}

/** The table is the backlog's default view mode. */
export function offeredBacklogViewMode(
  viewMode: ProjectBacklogViewMode,
  flags: MyWorkViewFlags,
): ProjectBacklogViewMode {
  return viewMode === "planning-space" && !flags.planningSpace ? "table" : viewMode;
}
