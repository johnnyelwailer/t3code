import { compactJson } from "@t3tools/project-context/t3teamDirectoryBundle";
import {
  buildJiraTicketAttachmentsIndexPath,
  buildJiraTicketFocusEntryPoint,
} from "@t3tools/project-context/t3teamContextPaths";

export function resolveT3TeamFocusSliceAttachmentIndexPath(input: {
  readonly projectId: string;
  readonly ticketKey: string;
  readonly focusKind: string;
}): string | undefined {
  return input.focusKind === "jira-ticket-attachments"
    ? buildJiraTicketAttachmentsIndexPath(input.projectId, input.ticketKey)
    : undefined;
}

export function buildT3TeamWorkItemFocusSliceFile(input: {
  readonly projectId: string;
  readonly ticketKey: string;
  readonly focusKind: string;
  readonly label: string;
  readonly summaryItems: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly ticketEntryPointRelativePath: string;
  readonly attachmentIndexRelativePath?: string;
}): { readonly relativePath: string; readonly contents: string } {
  const relativePath = buildJiraTicketFocusEntryPoint({
    projectId: input.projectId,
    ticketKey: input.ticketKey,
    focus: input.focusKind,
  });
  return {
    relativePath,
    contents: compactJson({
      kind: input.focusKind,
      label: input.label,
      summaryItems: input.summaryItems,
      ticketEntryPointRelativePath: input.ticketEntryPointRelativePath,
      ...(input.attachmentIndexRelativePath
        ? { attachmentIndexRelativePath: input.attachmentIndexRelativePath }
        : {}),
    }),
  };
}
