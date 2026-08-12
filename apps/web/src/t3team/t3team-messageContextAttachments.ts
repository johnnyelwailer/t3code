import type { T3TeamMessageAttachment, T3TeamMessageExt } from "@t3tools/contracts";

import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";

function contextAttachmentKindToResourceKind(
  kind: string,
): "issue" | "ticket" | "page" | "pull-request" | "epic" {
  if (kind === "jira-work-item") return "issue";
  if (kind.includes("pull-request")) return "pull-request";
  if (kind.includes("epic")) return "epic";
  return "page";
}

export function contextAttachmentToMessageAttachment(
  attachment: T3TeamContextAttachment,
): T3TeamMessageAttachment {
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
        provider: "t3team",
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
  attachments: ReadonlyArray<T3TeamContextAttachment>,
  input?: { readonly displayText?: string },
): T3TeamMessageExt | undefined {
  if (attachments.length === 0) return undefined;
  return {
    // An explicit empty string is meaningful here, not "no override": it is how an empty-body
    // message with a non-image attachment stops the UI falling back to `message.text`, which
    // for this codepath is the prompt WITH the attachment's context text prepended — showing
    // that dump as the visible message body would be worse than showing nothing.
    ...(input?.displayText !== undefined ? { displayText: input.displayText } : {}),
    visibleToUser: true,
    visibleToAgent: true,
    attachments: attachments.map(contextAttachmentToMessageAttachment),
  };
}
