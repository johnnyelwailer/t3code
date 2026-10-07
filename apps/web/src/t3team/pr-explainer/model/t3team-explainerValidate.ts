import type { T3TeamExplainer } from "./t3team-explainer";
import type { T3TeamExplainerBlock } from "./t3team-explainerBlock";

/**
 * One problem in a decoded explainer, shaped so a generator can repair it: `path` names the
 * field (`steps[2].blocks[0].flow[1]`) and `code` the rule. `error` breaks what the reader sees
 * (a map part that never shows, a reference to nothing); `warning` degrades it.
 */
type Report = (
  severity: T3TeamExplainerIssue["severity"],
  code: T3TeamExplainerIssue["code"],
  path: string,
  message: string,
) => void;
type Refs = (
  ids: ReadonlyArray<string> | undefined,
  known: ReadonlySet<string>,
  code: "unknownNode" | "unknownEdge" | "unknownActor",
  path: string,
) => void;

export interface T3TeamExplainerIssue {
  readonly severity: "error" | "warning";
  readonly code:
    | "duplicateId"
    | "unknownStep"
    | "unknownNode"
    | "unknownEdge"
    | "unknownActor"
    | "removedBeforeSince"
    | "mapBlockWithoutMap"
    | "unsupportedBlock"
    | "highlightNotFound";
  readonly path: string;
  readonly message: string;
}

/**
 * The checks a schema cannot express: ids are unique, every reference resolves, and nothing is
 * removed before it appears. Returns no issues for a sound explainer.
 */
export function validateT3TeamExplainer(
  explainer: T3TeamExplainer,
): ReadonlyArray<T3TeamExplainerIssue> {
  const issues: T3TeamExplainerIssue[] = [];
  const report: Report = (severity, code, path, message) =>
    issues.push({ severity, code, path, message });
  const unique = (ids: ReadonlyArray<string>, path: (index: number) => string, what: string) => {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      if (seen.has(id))
        report("error", "duplicateId", path(index), `Duplicate ${what} id "${id}".`);
      seen.add(id);
    });
    return seen;
  };

  const stepIndex = new Map<string, number>();
  explainer.steps.forEach((step, index) => {
    if (!stepIndex.has(step.id)) stepIndex.set(step.id, index);
  });
  unique(
    explainer.steps.map((step) => step.id),
    (index) => `steps[${index}].id`,
    "step",
  );

  const map = explainer.map;
  const nodes = unique(
    map?.nodes.map((node) => node.id) ?? [],
    (index) => `map.nodes[${index}].id`,
    "map node",
  );
  const edges = unique(
    map?.edges.map((edge) => edge.id) ?? [],
    (index) => `map.edges[${index}].id`,
    "map edge",
  );
  const lifetime = (
    part: { readonly since?: string; readonly removedAt?: string },
    path: string,
  ) => {
    for (const key of ["since", "removedAt"] as const) {
      const id = part[key];
      if (id !== undefined && !stepIndex.has(id)) {
        report("error", "unknownStep", `${path}.${key}`, `No step has id "${id}".`);
      }
    }
    const since = part.since === undefined ? -1 : stepIndex.get(part.since);
    const removedAt = part.removedAt === undefined ? undefined : stepIndex.get(part.removedAt);
    if (since !== undefined && removedAt !== undefined && removedAt < since) {
      report("error", "removedBeforeSince", `${path}.removedAt`, "Removed before it appears.");
    }
  };
  map?.nodes.forEach((node, index) => lifetime(node, `map.nodes[${index}]`));
  map?.edges.forEach((edge, index) => {
    const path = `map.edges[${index}]`;
    lifetime(edge, path);
    for (const end of ["from", "to"] as const) {
      if (!nodes.has(edge[end])) {
        report("error", "unknownNode", `${path}.${end}`, `No map node has id "${edge[end]}".`);
      }
    }
  });

  const refs: Refs = (ids, known, code, path) =>
    ids?.forEach((id, index) => {
      if (!known.has(id)) report("error", code, `${path}[${index}]`, `Unknown id "${id}".`);
    });

  explainer.steps.forEach((step, stepAt) => {
    unique(
      step.blocks.map((block) => block.id),
      (index) => `steps[${stepAt}].blocks[${index}].id`,
      "block",
    );
    step.blocks.forEach((block, blockAt) => {
      const path = `steps[${stepAt}].blocks[${blockAt}]`;
      validateBlock(block, path, { nodes, edges, hasMap: map !== undefined, report, refs });
    });
  });
  return issues;
}

function validateBlock(
  block: T3TeamExplainerBlock,
  path: string,
  context: {
    readonly nodes: ReadonlySet<string>;
    readonly edges: ReadonlySet<string>;
    readonly hasMap: boolean;
    readonly report: Report;
    readonly refs: Refs;
  },
) {
  const { report, refs } = context;
  switch (block.type) {
    case "unsupported":
      report(
        "warning",
        "unsupportedBlock",
        path,
        block.reason === "invalid"
          ? `The "${block.sourceType}" block has fields this build cannot read.`
          : `Unknown block type "${block.sourceType}".`,
      );
      return;
    case "map":
      if (!context.hasMap) {
        report("error", "mapBlockWithoutMap", path, "A map block needs the explainer's map.");
      }
      refs(block.touches?.nodes, context.nodes, "unknownNode", `${path}.touches.nodes`);
      refs(block.touches?.edges, context.edges, "unknownEdge", `${path}.touches.edges`);
      refs(block.flow, context.edges, "unknownEdge", `${path}.flow`);
      refs(block.warn, context.nodes, "unknownNode", `${path}.warn`);
      return;
    case "sequence": {
      const actors = new Set(block.actors.map((actor) => actor.id));
      block.messages.forEach((message, index) => {
        refs([message.from, message.to], actors, "unknownActor", `${path}.messages[${index}]`);
      });
      return;
    }
    case "diff":
      [...(block.before ?? []), ...block.lines, ...(block.after ?? [])].forEach((line, index) =>
        line.highlight?.forEach((word, at) => {
          if (!line.content.includes(word)) {
            report(
              "warning",
              "highlightNotFound",
              `${path}.line[${index}].highlight[${at}]`,
              `"${word}" is not in the line.`,
            );
          }
        }),
      );
      return;
    default:
      return;
  }
}
