import type {
  T3TeamPrExplainer,
  T3TeamPrExplainerMapEdge,
  T3TeamPrExplainerMapNode,
} from "@t3tools/contracts";

/**
 * How one map part looks at the current step. `entering` and `removing` happen in this step;
 * `gone` is a part removed by an earlier step, kept faint so the reader keeps their bearings.
 */
export type PrExplainerPartPhase = "hidden" | "entering" | "present" | "removing" | "gone";

export interface PrExplainerNodeFrame {
  readonly node: T3TeamPrExplainerMapNode;
  readonly phase: PrExplainerPartPhase;
  readonly focus: boolean;
  readonly warn: boolean;
}

export interface PrExplainerEdgeFrame {
  readonly edge: T3TeamPrExplainerMapEdge;
  readonly phase: PrExplainerPartPhase;
  readonly focus: boolean;
  /** Dots run along it: the path this step is about. */
  readonly flow: boolean;
}

export interface PrExplainerMapFrame {
  readonly nodes: ReadonlyArray<PrExplainerNodeFrame>;
  readonly edges: ReadonlyArray<PrExplainerEdgeFrame>;
}

function phaseOf(
  part: { readonly since?: string; readonly removedAt?: string },
  stepIndexById: ReadonlyMap<string, number>,
  current: number,
): PrExplainerPartPhase {
  // A step that has not streamed in yet counts as the future.
  const since = part.since === undefined ? -1 : (stepIndexById.get(part.since) ?? Infinity);
  const removedAt =
    part.removedAt === undefined ? Infinity : (stepIndexById.get(part.removedAt) ?? Infinity);
  if (current < since) return "hidden";
  if (current > removedAt) return "gone";
  if (current === removedAt) return "removing";
  if (current === since) return "entering";
  return "present";
}

/** The map as the step at `current` draws it: the before→after morph, derived from the data. */
export function derivePrExplainerMapFrame(
  explainer: T3TeamPrExplainer,
  current: number,
): PrExplainerMapFrame | null {
  const map = explainer.map;
  if (!map) return null;
  const stepIndexById = new Map(explainer.steps.map((step, index) => [step.id, index]));
  const step = explainer.steps[current];
  const visual = step?.visual.kind === "map" ? step.visual : null;
  const touchedNodes = new Set(step?.touches?.nodes ?? []);
  const touchedEdges = new Set(step?.touches?.edges ?? []);
  const warn = new Set(visual?.warn ?? []);
  const flow = new Set(visual?.flow ?? []);
  const nodes = map.nodes.map((node) => ({
    node,
    phase: phaseOf(node, stepIndexById, current),
    focus: touchedNodes.has(node.id),
    warn: warn.has(node.id),
  }));
  const visibleNodes = new Set(
    nodes.filter((frame) => frame.phase !== "hidden").map((frame) => frame.node.id),
  );
  const edges = map.edges
    .map((edge) => ({
      edge,
      phase: phaseOf(edge, stepIndexById, current),
      focus: touchedEdges.has(edge.id),
      flow: flow.has(edge.id),
    }))
    // An edge never outlives the nodes it joins.
    .map((frame) =>
      visibleNodes.has(frame.edge.from) && visibleNodes.has(frame.edge.to)
        ? frame
        : { ...frame, phase: "hidden" as const },
    );
  return { nodes, edges };
}

/** Grid → SVG geometry, shared by the map and its hit targets. */
export const PR_EXPLAINER_MAP_GRID = {
  nodeWidth: 116,
  nodeHeight: 40,
  colGap: 156,
  rowGap: 70,
  pad: 14,
} as const;

export function prExplainerMapViewBox(explainer: T3TeamPrExplainer) {
  const g = PR_EXPLAINER_MAP_GRID;
  const nodes = explainer.map?.nodes ?? [];
  const cols = Math.max(1, ...nodes.map((node) => node.col + 1));
  const rows = Math.max(1, ...nodes.map((node) => node.row + 1));
  return {
    width: g.pad * 2 + (cols - 1) * g.colGap + g.nodeWidth,
    height: g.pad * 2 + (rows - 1) * g.rowGap + g.nodeHeight,
  };
}

export function prExplainerNodeBox(node: Pick<T3TeamPrExplainerMapNode, "col" | "row">) {
  const g = PR_EXPLAINER_MAP_GRID;
  return {
    x: g.pad + node.col * g.colGap,
    y: g.pad + node.row * g.rowGap,
    width: g.nodeWidth,
    height: g.nodeHeight,
  };
}

/** A straight connector from one node's border to the other's, as an SVG path. */
export function prExplainerEdgePath(
  from: Pick<T3TeamPrExplainerMapNode, "col" | "row">,
  to: Pick<T3TeamPrExplainerMapNode, "col" | "row">,
) {
  const a = prExplainerNodeBox(from);
  const b = prExplainerNodeBox(to);
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  // Leave each box through the side facing the other one.
  const horizontal = Math.abs(bx - ax) * a.height >= Math.abs(by - ay) * a.width;
  const sx = horizontal ? ax + Math.sign(bx - ax) * (a.width / 2) : ax;
  const sy = horizontal ? ay : ay + Math.sign(by - ay) * (a.height / 2);
  const ex = horizontal ? bx - Math.sign(bx - ax) * (b.width / 2 + 4) : bx;
  const ey = horizontal ? by : by - Math.sign(by - ay) * (b.height / 2 + 4);
  return {
    d: `M ${sx} ${sy} L ${ex} ${ey}`,
    mid: { x: (sx + ex) / 2, y: (sy + ey) / 2 },
    horizontal,
  };
}
