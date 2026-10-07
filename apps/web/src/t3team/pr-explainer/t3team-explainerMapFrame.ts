import type {
  T3TeamExplainer,
  T3TeamExplainerMapBlock,
  T3TeamExplainerMapEdge,
  T3TeamExplainerMapNode,
} from "./model/t3team-explainer";

/**
 * How one map part looks at the current step. `entering` and `removing` happen in this step;
 * `gone` is a part removed by an earlier step, kept faint so the reader keeps their bearings.
 */
export type ExplainerPartPhase = "hidden" | "entering" | "present" | "removing" | "gone";

export interface ExplainerNodeView {
  readonly node: T3TeamExplainerMapNode;
  readonly phase: ExplainerPartPhase;
  readonly focus: boolean;
  readonly warn: boolean;
}

export interface ExplainerEdgeView {
  readonly edge: T3TeamExplainerMapEdge;
  readonly phase: ExplainerPartPhase;
  readonly focus: boolean;
  /** Dots run along it: the path this step is about. */
  readonly flow: boolean;
}

/** The whole map as one step draws it. */
export interface ExplainerMapView {
  readonly nodes: ReadonlyArray<ExplainerNodeView>;
  readonly edges: ReadonlyArray<ExplainerEdgeView>;
}

/**
 * A step id the explainer does not have. While steps still stream in it is a step not written
 * yet, so the part waits for it; once the explainer is complete it is a model error (the
 * validator reports it) and the reference is ignored rather than hiding the part forever.
 */
function stepAt(id: string | undefined, steps: ReadonlyMap<string, number>, streaming: boolean) {
  if (id === undefined) return undefined;
  const index = steps.get(id);
  if (index !== undefined) return index;
  return streaming ? Number.POSITIVE_INFINITY : undefined;
}

function phaseOf(
  part: { readonly since?: string; readonly removedAt?: string },
  steps: ReadonlyMap<string, number>,
  current: number,
  streaming: boolean,
): ExplainerPartPhase {
  const since = stepAt(part.since, steps, streaming) ?? -1;
  const removedAt = stepAt(part.removedAt, steps, streaming) ?? Number.POSITIVE_INFINITY;
  if (current < since) return "hidden";
  if (current > removedAt) return "gone";
  if (current === removedAt) return "removing";
  if (current === since) return "entering";
  return "present";
}

// The phase that wins when an edge and its nodes disagree: an edge never outlives a node it
// joins, and enters with a node that enters.
const PHASE_RANK: Record<ExplainerPartPhase, number> = {
  present: 0,
  entering: 1,
  removing: 2,
  gone: 3,
  hidden: 4,
};

/** The map as the step at `current` draws it: the before→after morph, derived from the data. */
export function deriveExplainerMapView(
  explainer: T3TeamExplainer,
  current: number,
  block: T3TeamExplainerMapBlock | null,
  options: { readonly streaming?: boolean } = {},
): ExplainerMapView | null {
  const map = explainer.map;
  if (!map) return null;
  const streaming = options.streaming ?? false;
  const steps = new Map(explainer.steps.map((step, index) => [step.id, index]));
  const touchedNodes = new Set(block?.touches?.nodes ?? []);
  const touchedEdges = new Set(block?.touches?.edges ?? []);
  const warn = new Set(block?.warn ?? []);
  const flow = new Set(block?.flow ?? []);
  const nodes = map.nodes.map((node) => ({
    node,
    phase: phaseOf(node, steps, current, streaming),
    focus: touchedNodes.has(node.id),
    warn: warn.has(node.id),
  }));
  const nodePhase = new Map(nodes.map((view) => [view.node.id, view.phase]));
  const edges = map.edges.map((edge) => {
    const phase = [
      phaseOf(edge, steps, current, streaming),
      nodePhase.get(edge.from) ?? "hidden",
      nodePhase.get(edge.to) ?? "hidden",
    ].reduce((worst, next) => (PHASE_RANK[next] > PHASE_RANK[worst] ? next : worst));
    return { edge, phase, focus: touchedEdges.has(edge.id), flow: flow.has(edge.id) };
  });
  return { nodes, edges };
}

/** Grid → SVG geometry, shared by the map and its hit targets. */
export const EXPLAINER_MAP_GRID = {
  nodeWidth: 116,
  nodeHeight: 40,
  colGap: 156,
  rowGap: 70,
  pad: 14,
} as const;

export function explainerMapViewBox(explainer: T3TeamExplainer) {
  const g = EXPLAINER_MAP_GRID;
  const nodes = explainer.map?.nodes ?? [];
  const cols = Math.max(1, ...nodes.map((node) => node.col + 1));
  const rows = Math.max(1, ...nodes.map((node) => node.row + 1));
  return {
    width: g.pad * 2 + (cols - 1) * g.colGap + g.nodeWidth,
    height: g.pad * 2 + (rows - 1) * g.rowGap + g.nodeHeight,
  };
}

export function explainerNodeBox(node: Pick<T3TeamExplainerMapNode, "col" | "row">) {
  const g = EXPLAINER_MAP_GRID;
  return {
    x: g.pad + node.col * g.colGap,
    y: g.pad + node.row * g.rowGap,
    width: g.nodeWidth,
    height: g.nodeHeight,
  };
}

/** A straight connector from one node's border to the other's, as an SVG path. */
export function explainerEdgePath(
  from: Pick<T3TeamExplainerMapNode, "col" | "row">,
  to: Pick<T3TeamExplainerMapNode, "col" | "row">,
) {
  const a = explainerNodeBox(from);
  const b = explainerNodeBox(to);
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
