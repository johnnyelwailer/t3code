import type { ResourceSnapshot } from "@t3tools/project-context";

import { extractT3TeamJiraRelationshipKeys } from "./t3team-context-jira-relationships.ts";

export function buildT3TeamContextBackgroundEdges(input: {
  readonly sourceKey: string;
  readonly depth: number;
  readonly snapshot: ResourceSnapshot;
}) {
  const relationships = extractT3TeamJiraRelationshipKeys(input.snapshot.raw);
  return [
    ...(relationships.parentKey
      ? [{ relation: "parent", targetKey: relationships.parentKey }]
      : []),
    ...relationships.childKeys.map((targetKey) => ({ relation: "child", targetKey })),
    ...relationships.referenceKeys.map((targetKey) => ({ relation: "reference", targetKey })),
  ].map((edge) => ({
    sourceKey: input.sourceKey,
    targetKey: edge.targetKey,
    relation: edge.relation,
    depth: input.depth + 1,
  }));
}
