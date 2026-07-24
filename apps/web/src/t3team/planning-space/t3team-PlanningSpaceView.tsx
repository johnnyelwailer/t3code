/**
 * Planning Space view (Epic 29) — the depth-zoom planning canvas. This file is
 * the thin composition root: usePlanningSpaceController owns all state,
 * derivation, interaction handlers, and engine/pointer effects; this component
 * just mounts the stage and renders the toolbar + stage layers. The heavy logic
 * lives in the sibling t3team-planningSpace* / t3team-PlanningSpace* modules.
 */

import { PLANNING_SPACE_CSS } from "./t3team-planningSpaceViewChromeSync";
import { PlanningSpacePanels } from "./t3team-PlanningSpacePanels";
import { PlanningSpaceStageChrome } from "./t3team-PlanningSpaceStageChrome";
import { PlanningSpaceStageNodes } from "./t3team-PlanningSpaceStageNodes";
import { PlanningSpaceToolbar } from "./t3team-PlanningSpaceToolbar";
import {
  type PlanningSpaceProps,
  usePlanningSpaceController,
} from "./t3team-usePlanningSpaceController";

export type {
  PlanningSpaceGrouping,
  PlanningSpaceMutations,
} from "./t3team-planningSpaceViewConstants";

export function PlanningSpaceView(props: PlanningSpaceProps) {
  const c = usePlanningSpaceController(props);
  return (
    <div className="t3ps-root flex h-full min-h-0 flex-col">
      <style>{PLANNING_SPACE_CSS}</style>
      <PlanningSpaceToolbar c={c} />
      <div
        ref={c.stageRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden border-t border-border/70 bg-background/60 cursor-grab select-none"
        data-testid="planning-space-stage"
      >
        <PlanningSpaceStageNodes c={c} />
        <PlanningSpaceStageChrome c={c} />
        <PlanningSpacePanels c={c} />
      </div>
    </div>
  );
}
