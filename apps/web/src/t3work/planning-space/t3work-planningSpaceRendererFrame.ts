import {
  type PlanningCamera,
  type SceneBounds,
  type Viewport,
  Z_STORY,
  bandForScale,
  fitCameraToBounds,
  scaleForPlane,
} from "./t3work-planningSpaceScene";
import {
  CAMERA_LERP,
  type EdgePaintCache,
  type EngineEdge,
  type EngineNode,
  paintPlanningEdges,
  paintPlanningNodes,
} from "./t3work-planningSpaceRendererPaint";

export function paintPlanningSpaceFrame(input: {
  readonly viewport: Viewport;
  readonly fitRequest: SceneBounds | null;
  readonly camera: PlanningCamera;
  readonly cameraTarget: PlanningCamera;
  readonly zMinValue: number;
  readonly nodes: Iterable<EngineNode>;
  readonly nodesById: ReadonlyMap<string, EngineNode>;
  readonly edges: ReadonlyArray<EngineEdge>;
  readonly edgePaint: WeakMap<SVGLineElement, EdgePaintCache>;
  readonly dimmedIds: ReadonlySet<string> | null;
  readonly lastGlobalBand: number;
  readonly onBandChange?: ((band: number) => void) | null;
}): {
  readonly camera: PlanningCamera;
  readonly cameraTarget: PlanningCamera;
  readonly zMinValue: number;
  readonly lastGlobalBand: number;
} {
  let cameraTarget = input.cameraTarget;
  let zMinValue = input.zMinValue;
  if (input.fitRequest) {
    cameraTarget = fitCameraToBounds(input.fitRequest, input.viewport);
    zMinValue = Math.min(zMinValue, cameraTarget.z - 60);
  }

  const camera = {
    x: input.camera.x + (cameraTarget.x - input.camera.x) * CAMERA_LERP,
    y: input.camera.y + (cameraTarget.y - input.camera.y) * CAMERA_LERP,
    z: input.camera.z + (cameraTarget.z - input.camera.z) * CAMERA_LERP,
  };
  const storyScale = scaleForPlane(camera.z, Z_STORY);
  const globalBand = bandForScale(storyScale);
  let lastGlobalBand = input.lastGlobalBand;
  if (globalBand !== lastGlobalBand) {
    lastGlobalBand = globalBand;
    input.onBandChange?.(globalBand);
  }

  paintPlanningNodes({
    nodes: input.nodes,
    camera,
    viewport: input.viewport,
    storyScale,
    globalBand,
    dimmedIds: input.dimmedIds,
  });
  paintPlanningEdges({ edges: input.edges, nodes: input.nodesById, edgePaint: input.edgePaint });

  return { camera, cameraTarget, zMinValue, lastGlobalBand };
}
