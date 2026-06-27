/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { PlanningNodeKind, PlanningSpaceCtx } from "./t3work-planningSpaceControllerTypes";
import type { PlanningSpaceControllerRefs } from "./t3work-usePlanningSpaceControllerRefs";
import type { PlanningSpaceViewModel } from "./t3work-planningSpaceViewModel";
import type { PlanningSpaceMutations } from "./t3work-planningSpaceViewConstants";
import type { PlanningSpaceHandlers } from "./t3work-planningSpaceHandlers";

export function buildPlanningSpaceControllerCtx(input: {
  readonly refs: PlanningSpaceControllerRefs;
  readonly vm: PlanningSpaceViewModel;
  readonly mutations: PlanningSpaceMutations | undefined;
}): PlanningSpaceCtx {
  const r = input.refs;
  return {
    stageRef: r.stageRef,
    engineRef: r.engineRef,
    edgeRefs: r.edgeRefs,
    nodeEls: r.nodeEls,
    detailItemRef: r.detailItemRef,
    machineState: r.machineState,
    ghostRef: r.ghostRef,
    leaderRef: r.leaderRef,
    epicDetailRef: r.epicDetailRef,
    contextMenuRef: r.contextMenuRef,
    zoomToggleRef: r.zoomToggleRef,
    gaugeMarkerRef: r.gaugeMarkerRef,
    setAllModeRef: r.setAllModeRef,
    allModeRef: r.allModeRef,
    cameraBeforeAll: r.cameraBeforeAll,
    activeBandRef: r.activeBandRef,
    atFullBandRef: r.atFullBandRef,
    gaugeButtonRefs: r.gaugeButtonRefs,
    navPrevRef: r.navPrevRef,
    navNextRef: r.navNextRef,
    snapTargetRef: r.snapTargetRef,
    lastInputAt: r.lastInputAt,
    layoutRef: r.layoutRef,
    toastTimer: r.toastTimer,
    refCache: r.refCache,
    applyLayoutTargetsRef: r.applyLayoutTargetsRef,
    frameGroupRef: r.frameGroupRef,
    userNavigated: r.userNavigated,
    initialFitDoneRef: r.initialFitDoneRef,
    lastAutoFitStageSizeRef: r.lastAutoFitStageSizeRef,
    mutationsRef: r.mutationsRef,
    engineReady: r.engineReady,
    grouping: r.grouping,
    allMode: r.allMode,
    stageSize: r.stageSize,
    pendingFrameOwner: r.pendingFrameOwner,
    assignTarget: r.assignTarget,
    detailItem: r.detailItem,
    dragActive: r.dragActive,
    setEngineReady: r.setEngineReady,
    setGrouping: r.setGrouping,
    setAllMode: r.setAllMode,
    setAtFullBand: r.setAtFullBand,
    setStageSize: r.setStageSize,
    setToast: r.setToast,
    setDragActive: r.setDragActive,
    setPendingFrameOwner: r.setPendingFrameOwner,
    setAssignTarget: r.setAssignTarget,
    setDetailItem: r.setDetailItem,
    setEpicDetailId: r.setEpicDetailId,
    setSpotlight: r.setSpotlight,
    setContextMenu: r.setContextMenu,
    vm: input.vm,
    mutations: input.mutations,
    handlers: undefined as unknown as PlanningSpaceHandlers,
  };
}
