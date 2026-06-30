import type { T3workMessageAttachment, T3workMessageExt } from "@t3tools/contracts";

import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";

function contextAttachmentKindToResourceKind(
  kind: string,
): "issue" | "ticket" | "page" | "pull-request" | "epic" {
  if (kind === "jira-work-item") return "issue";
  if (kind.includes("pull-request")) return "pull-request";
  if (kind.includes("epic")) return "epic";
  return "page";
}

export function contextAttachmentToMessageAttachment(
  attachment: T3WorkContextAttachment,
): T3workMessageAttachment {
  const summaryFields = Object.fromEntries(
    (attachment.summaryItems ?? []).map((item) => [item.label, item.value]),
  );
  const status =
    attachment.summaryItems?.find((item) => item.label.toLowerCase() === "status")?.value ??
    attachment.syncStatus;

  return {
    kind: "resource",
    resource: {
      ref: {
        provider: "t3work",
        kind: contextAttachmentKindToResourceKind(attachment.kind),
        id: attachment.dedupeKey ?? attachment.id,
        title: attachment.label,
        ...(attachment.description ? { description: attachment.description } : {}),
        ...(attachment.jiraIssueType ? { type: attachment.jiraIssueType } : {}),
        ...(attachment.jiraIssueTypeIconUrl
          ? { issueTypeIconUrl: attachment.jiraIssueTypeIconUrl }
          : {}),
        ...(status ? { status } : {}),
      },
      fetchedAt: attachment.syncedAt ?? new Date(0).toISOString(),
      fields: {
        kind: attachment.kind,
        ...summaryFields,
        ...(attachment.fileReferences ? { fileReferences: attachment.fileReferences } : {}),
      },
      text: attachment.contextText,
    },
  };
}

export function buildContextAttachmentMessageExt(
  attachments: ReadonlyArray<T3WorkContextAttachment>,
  input?: { readonly displayText?: string },
): T3workMessageExt | undefined {
  if (attachments.length === 0) return undefined;
  return {
    ...(input?.displayText ? { displayText: input.displayText } : {}),
    visibleToUser: true,
    visibleToAgent: true,
    attachments: attachments.map(contextAttachmentToMessageAttachment),
  };
}
