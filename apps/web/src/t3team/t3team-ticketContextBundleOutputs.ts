import type { AddToChatPayloadProgressUpdate } from "~/t3team/t3team-addToChatUtils";
import { buildJiraTicketFocusEntryPoint } from "~/t3team/t3team-contextCachePaths";
import type {
  T3TeamDirectoryBundleFile,
  T3TeamDirectoryBundlePayload,
  T3TeamDirectoryBundleReference,
} from "~/t3team/t3team-contextDirectoryBundle";
import type { TicketContextGraph } from "~/t3team/t3team-ticketContextGraph";

type SummaryItem = { label: string; value: string };

export type TicketContextFocusInput = {
  kind: string;
  label: string;
  summaryItems?: ReadonlyArray<SummaryItem>;
};

export function buildTicketContextBundlePreparedUpdate(input: {
  graph: TicketContextGraph;
  skippedRelationCount: number;
}): AddToChatPayloadProgressUpdate {
  return {
    phase: "Building cached context files",
    progressCurrent: input.graph.nodes.size,
    progressTotal: input.graph.nodes.size,
    syncInfo: {
      contentLabel: "Jira work item context",
      currentItemLabel: `${input.graph.nodes.size} focused item${input.graph.nodes.size === 1 ? "" : "s"} prepared`,
      ...(input.skippedRelationCount > 0
        ? {
            currentItemDetail: `Skipped ${input.skippedRelationCount} lower-priority direct relation${input.skippedRelationCount === 1 ? "" : "s"}`,
          }
        : {}),
      items: Array.from(input.graph.nodes.values()).map((node) => {
        const item: {
          id: string;
          label: string;
          status: "completed";
          detail?: string;
        } = {
          id: node.key,
          label: node.key,
          status: "completed",
        };
        if (node.ticket?.ref.title) {
          item.detail = node.ticket.ref.title;
        }
        return item;
      }),
    },
  };
}

function buildTicketBundleReferences(input: {
  rootEntryPoint: string;
  rootAttachmentIndexRelativePath?: string;
}): T3TeamDirectoryBundleReference[] {
  return [
    ...(input.rootAttachmentIndexRelativePath
      ? [{ label: "Attachment index", relativePath: input.rootAttachmentIndexRelativePath }]
      : []),
    { label: "Ticket entrypoint", relativePath: input.rootEntryPoint },
  ];
}

export function buildFocusedTicketContextBundle(input: {
  focus: TicketContextFocusInput;
  files: ReadonlyArray<T3TeamDirectoryBundleFile>;
  projectId: string;
  root: string;
  rootKey: string;
  rootEntryPoint: string;
  rootAttachmentIndexRelativePath?: string;
}): T3TeamDirectoryBundlePayload {
  const focusPath = buildJiraTicketFocusEntryPoint({
    projectId: input.projectId,
    ticketKey: input.rootKey,
    focus: input.focus.kind,
  });
  const references: T3TeamDirectoryBundleReference[] = [
    { label: "Focused context", relativePath: focusPath },
    ...buildTicketBundleReferences({
      rootEntryPoint: input.rootEntryPoint,
      ...(input.rootAttachmentIndexRelativePath
        ? { rootAttachmentIndexRelativePath: input.rootAttachmentIndexRelativePath }
        : {}),
    }),
  ];

  return {
    kind: "t3team-directory-bundle",
    dedupeKey: `${input.projectId}:${input.rootKey}:${input.focus.kind}`,
    bundleRootRelativePath: input.root,
    files: input.files,
    fileReferences: references,
    lightweightItem: {
      kind: input.focus.kind,
      label: input.focus.label,
      summaryItems: input.focus.summaryItems ?? [],
      references,
    },
  };
}

export function buildWorkItemTicketContextBundle(input: {
  files: ReadonlyArray<T3TeamDirectoryBundleFile>;
  projectId: string;
  root: string;
  rootKey: string;
  rootEntryPoint: string;
  rootAttachmentIndexRelativePath?: string;
  ticketLabel: string;
  ticketSummaryItems: ReadonlyArray<SummaryItem>;
}): T3TeamDirectoryBundlePayload {
  const references = buildTicketBundleReferences({
    rootEntryPoint: input.rootEntryPoint,
    ...(input.rootAttachmentIndexRelativePath
      ? { rootAttachmentIndexRelativePath: input.rootAttachmentIndexRelativePath }
      : {}),
  });

  return {
    kind: "t3team-directory-bundle",
    dedupeKey: `${input.projectId}:${input.rootKey}:work-item`,
    bundleRootRelativePath: input.root,
    files: input.files,
    fileReferences: references,
    lightweightItem: {
      kind: "jira-work-item",
      label: input.ticketLabel,
      summaryItems: input.ticketSummaryItems,
      references,
    },
  };
}
