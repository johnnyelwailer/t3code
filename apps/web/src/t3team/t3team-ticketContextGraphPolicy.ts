import type { ProjectShellProject } from "@t3tools/project-context";

import type { RelationshipEntry } from "~/t3team/t3team-ticketRelationships-helpers";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  normalizeTicketContextEntryKey,
  selectTicketContextEntries,
  TICKET_CONTEXT_GRAPH_LIMITS,
} from "~/t3team/t3team-ticketContextGraphSelection";

export type TicketContextGraphWorkKind = "root" | "parent" | "child" | "reference";

export type TicketContextGraphWorkItem = {
  key: string;
  kind: TicketContextGraphWorkKind;
  depth: number;
  sourceKey?: string;
};

export type TicketContextGraphSelectionSummary = {
  strategy: "focused";
  parentChainIncluded: number;
  directChildrenIncluded: number;
  directChildrenSkipped: number;
  directReferencesIncluded: number;
  directReferencesSkipped: number;
};

export function createTicketContextSelectionSummary(): TicketContextGraphSelectionSummary {
  return {
    strategy: "focused",
    parentChainIncluded: 0,
    directChildrenIncluded: 0,
    directChildrenSkipped: 0,
    directReferencesIncluded: 0,
    directReferencesSkipped: 0,
  };
}

export function buildScopedTicketContextExpansion(input: {
  project: ProjectShellProject;
  workItem: TicketContextGraphWorkItem;
  parentEntry?: RelationshipEntry;
  childEntries: ReadonlyArray<RelationshipEntry>;
  referencedEntries: ReadonlyArray<RelationshipEntry>;
}): {
  relationshipKeys: {
    parentKey?: string;
    childKeys: string[];
    referenceKeys: string[];
  };
  nextItems: TicketContextGraphWorkItem[];
  selectionDelta: Partial<TicketContextGraphSelectionSummary>;
} {
  if (input.workItem.kind === "root") {
    const selectedChildKeys = selectTicketContextEntries({
      entries: input.childEntries,
      project: input.project,
      limit: TICKET_CONTEXT_GRAPH_LIMITS.maxDirectChildren,
    });
    const selectedReferenceKeys = selectTicketContextEntries({
      entries: input.referencedEntries,
      project: input.project,
      limit: TICKET_CONTEXT_GRAPH_LIMITS.maxDirectReferences,
      excludeKeys: new Set(selectedChildKeys),
    });
    const parentKey = input.parentEntry
      ? normalizeTicketContextEntryKey(input.parentEntry)
      : undefined;

    return {
      relationshipKeys: {
        ...(parentKey ? { parentKey } : {}),
        childKeys: selectedChildKeys,
        referenceKeys: selectedReferenceKeys,
      },
      nextItems: [
        ...(parentKey
          ? [
              {
                key: parentKey,
                kind: "parent" as const,
                depth: 1,
                sourceKey: input.workItem.key,
              },
            ]
          : []),
        ...selectedChildKeys.map((key) => ({
          key,
          kind: "child" as const,
          depth: 1,
          sourceKey: input.workItem.key,
        })),
        ...selectedReferenceKeys.map((key) => ({
          key,
          kind: "reference" as const,
          depth: 1,
          sourceKey: input.workItem.key,
        })),
      ],
      selectionDelta: {
        directChildrenIncluded: selectedChildKeys.length,
        directChildrenSkipped: Math.max(0, input.childEntries.length - selectedChildKeys.length),
        directReferencesIncluded: selectedReferenceKeys.length,
        directReferencesSkipped: Math.max(
          0,
          input.referencedEntries.length - selectedReferenceKeys.length,
        ),
      },
    };
  }

  if (input.workItem.kind === "parent") {
    const nextParentKey =
      input.parentEntry && input.workItem.depth < TICKET_CONTEXT_GRAPH_LIMITS.maxParentDepth
        ? normalizeTicketContextEntryKey(input.parentEntry)
        : undefined;

    return {
      relationshipKeys: {
        ...(nextParentKey ? { parentKey: nextParentKey } : {}),
        childKeys: input.workItem.sourceKey ? [input.workItem.sourceKey] : [],
        referenceKeys: [],
      },
      nextItems: nextParentKey
        ? [
            {
              key: nextParentKey,
              kind: "parent",
              depth: input.workItem.depth + 1,
              sourceKey: input.workItem.key,
            },
          ]
        : [],
      selectionDelta: {},
    };
  }

  if (input.workItem.kind === "child") {
    return {
      relationshipKeys: {
        ...(input.workItem.sourceKey ? { parentKey: input.workItem.sourceKey } : {}),
        childKeys: [],
        referenceKeys: [],
      },
      nextItems: [],
      selectionDelta: {},
    };
  }

  const sourceReferenceKey =
    input.workItem.sourceKey &&
    input.referencedEntries.some(
      (entry) => normalizeTicketContextEntryKey(entry) === input.workItem.sourceKey,
    )
      ? [input.workItem.sourceKey]
      : [];

  return {
    relationshipKeys: {
      childKeys: [],
      referenceKeys: sourceReferenceKey,
    },
    nextItems: [],
    selectionDelta: {},
  };
}

export function shouldFetchTicketContextSnapshot(input: {
  workItem: TicketContextGraphWorkItem;
  ticket: ProjectTicket | null;
  cachedSnapshotAvailable: boolean;
}): boolean {
  if (input.cachedSnapshotAvailable) {
    return false;
  }
  if (input.workItem.kind === "root" || input.workItem.kind === "parent") {
    return true;
  }
  return !input.ticket;
}
