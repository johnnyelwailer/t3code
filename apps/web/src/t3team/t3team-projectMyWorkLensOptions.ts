import type { ProjectMyWorkStatusCategory } from "~/t3team/t3team-projectMyWork";
import type { ProjectMyWorkLens } from "~/t3team/t3team-ProjectMyWorkViewSwitch";

/**
 * Which of the "My work options" a lens actually reads. The menu shows only these, so no control
 * is offered that would change nothing on screen.
 *
 * - Digest: `filterDigestTickets` applies status focus, hidden types (so also "Hide epics"),
 *   priority and exact status. It leaves ordering to the digest's own sectioning and never reads
 *   the view mode, grouping, sort or lane settings.
 * - List ("hierarchy"): always the parent/child tree. The view mode only picks list rows vs cards
 *   (table and board do not apply), grouping is moot because the tree is the grouping, and the
 *   sort orders every sibling group. Board lanes do not exist here.
 * - Board: the lens decides the layout, so the view mode is moot. Grouping switches between flat
 *   lanes and the parent/child matrix, the sort orders cards within a lane, and lanes can be hidden.
 */
export interface ProjectMyWorkLensOptions {
  readonly viewMode: boolean;
  readonly grouping: boolean;
  readonly sort: boolean;
  readonly kanbanLanes: boolean;
}

const LENS_OPTIONS: Record<ProjectMyWorkLens, ProjectMyWorkLensOptions> = {
  digest: { viewMode: false, grouping: false, sort: false, kanbanLanes: false },
  hierarchy: { viewMode: true, grouping: false, sort: true, kanbanLanes: false },
  board: { viewMode: false, grouping: true, sort: true, kanbanLanes: true },
};

export function getProjectMyWorkLensOptions(lens: ProjectMyWorkLens): ProjectMyWorkLensOptions {
  return LENS_OPTIONS[lens];
}

/**
 * The list lens is for open work: with no status filter chosen it hides Done, so a long tail of
 * finished tickets does not bury what is still in flight. Picking a status focus or an exact
 * status is the user asking for those tickets, so Done comes back.
 */
export function shouldHideDoneWork(input: {
  lens: ProjectMyWorkLens;
  statusCategory: ProjectMyWorkStatusCategory;
  selectedStatus: string;
}): boolean {
  return (
    input.lens === "hierarchy" && input.statusCategory === "all" && input.selectedStatus === "all"
  );
}
