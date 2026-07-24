import type { ProjectTicket } from "~/t3team/t3team-types";

type SummaryItem = { label: string; value: string };

type JiraContextMetadataInput = {
  kind?: string;
  jiraIssueType?: string;
  jiraIssueTypeIconUrl?: string;
  summaryItems?: ReadonlyArray<SummaryItem>;
};

function readSummaryValue(
  summaryItems: ReadonlyArray<SummaryItem> | undefined,
  label: string,
): string | undefined {
  const item = summaryItems?.find((candidate) => candidate.label.trim().toLowerCase() === label);
  const value = item?.value?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function buildJiraWorkItemSummary(ticket: ProjectTicket): {
  jiraIssueType?: string;
  jiraIssueTypeIconUrl?: string;
  summaryItems: ReadonlyArray<SummaryItem>;
} {
  const jiraIssueType = ticket.issueType ?? ticket.ref.type;
  const jiraIssueTypeIconUrl = ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl;
  return {
    ...(jiraIssueType ? { jiraIssueType } : {}),
    ...(jiraIssueTypeIconUrl ? { jiraIssueTypeIconUrl } : {}),
    summaryItems: [
      ...(jiraIssueType ? [{ label: "Issue type", value: jiraIssueType }] : []),
      { label: "Status", value: ticket.status },
      ...(ticket.priority ? [{ label: "Priority", value: ticket.priority }] : []),
      ...(ticket.assignee ? [{ label: "Assignee", value: ticket.assignee }] : []),
    ],
  };
}

export function resolveJiraContextAttachmentMetadata(input: JiraContextMetadataInput): {
  jiraIssueType?: string;
  jiraIssueTypeIconUrl?: string;
} {
  if (!input.kind?.startsWith("jira-")) {
    return {};
  }
  const jiraIssueType =
    input.jiraIssueType?.trim() || readSummaryValue(input.summaryItems, "issue type");
  const jiraIssueTypeIconUrl =
    input.jiraIssueTypeIconUrl?.trim() ||
    readSummaryValue(input.summaryItems, "issue type icon url");
  return {
    ...(jiraIssueType ? { jiraIssueType } : {}),
    ...(jiraIssueTypeIconUrl ? { jiraIssueTypeIconUrl } : {}),
  };
}

export function appendJiraContextMetadataLines(input: {
  lines: string[];
  summaryItems?: ReadonlyArray<SummaryItem>;
  jiraIssueType?: string;
  jiraIssueTypeIconUrl?: string;
}): void {
  const hasIssueTypeSummary =
    input.summaryItems?.some((item) => item.label.trim().toLowerCase() === "issue type") ?? false;
  if (!hasIssueTypeSummary && input.jiraIssueType) {
    input.lines.push(`- Issue type: ${input.jiraIssueType}`);
  }
  const hasIssueTypeIconUrlSummary =
    input.summaryItems?.some((item) => item.label.trim().toLowerCase() === "issue type icon url") ??
    false;
  if (!hasIssueTypeIconUrlSummary && input.jiraIssueTypeIconUrl) {
    input.lines.push(`- Issue type icon URL: ${input.jiraIssueTypeIconUrl}`);
  }
}
