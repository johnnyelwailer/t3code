import type {
  ExternalProject,
  IntegrationAccount,
  IntegrationAccountRef,
} from "@t3tools/integrations-core";
import type { ExternalResourceRef, ResourceSnapshot } from "@t3tools/project-context";
import * as DateTime from "effect/DateTime";
import type { JiraComment, JiraIssue, JiraIssueSearchResponse, JiraProject } from "./client.ts";
import { extractAdfText } from "./adf/traverse.ts";
import { convertAdfToMarkdown } from "./adf/toMarkdown.ts";
import {
  readJiraEstimateValue,
  readJiraSprints,
  type JiraEstimateField,
  type JiraSprintField,
} from "./planning.ts";
import {
  extractAdfDocument,
  extractAffectsVersions,
  extractComponents,
  extractCreated,
  extractDueDate,
  extractFixVersions,
  extractHasVoted,
  extractIsWatching,
  extractParentSummary,
  extractResolutionName,
  extractResolvedAt,
  extractStatusCategory,
  extractTimeTracking,
  extractVoteCount,
  extractWatchCount,
  pickAvatarUrl,
} from "./normalizeIssueFields.ts";

type JiraAttachment = {
  readonly id?: string;
  readonly filename?: string;
  readonly mimeType?: string;
  readonly content?: string;
  readonly thumbnail?: string;
  readonly size?: number;
  readonly author?: {
    readonly accountId?: string;
    readonly avatarUrls?: Record<string, string>;
  };
};

function isoNow(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

export function normalizeAccount(
  siteUrl: string,
  myself: { displayName: string; accountId: string },
  accountId?: string,
): IntegrationAccount {
  return {
    id: accountId ?? siteUrl,
    provider: "atlassian",
    label: myself.displayName,
    accountUrl: siteUrl,
  };
}

export function normalizeAccountRef(siteUrl: string): IntegrationAccountRef {
  return {
    id: siteUrl,
    provider: "atlassian",
  };
}

export function normalizeProject(project: JiraProject, siteUrl: string): ExternalProject {
  const iconUrl = pickAvatarUrl(project.avatarUrls);
  return {
    id: project.id,
    provider: "atlassian",
    title: project.name,
    key: project.key,
    url: project.self ?? `${siteUrl}/browse/${project.key}`,
    iconUrl,
    description: undefined,
    raw: {
      siteUrl,
      projectTypeKey: project.projectTypeKey,
      avatarUrl: iconUrl,
    },
  };
}

// Plain-text flattening of an ADF node/document. Delegates to the shared
// implementation in ./adf/traverse.ts — keep exactly one implementation.
const extractTextFromADF = extractAdfText;

function extractDisplayName(user: unknown): string | undefined {
  if (user === null || user === undefined) return undefined;
  if (typeof user !== "object") return undefined;
  const obj = user as Record<string, unknown>;
  if (typeof obj.displayName === "string") return obj.displayName;
  return undefined;
}

function extractStatusName(status: unknown): string | undefined {
  if (status === null || status === undefined) return undefined;
  if (typeof status !== "object") return undefined;
  const obj = status as Record<string, unknown>;
  if (typeof obj.name === "string") return obj.name;
  return undefined;
}

function extractParentKey(parent: unknown): string | undefined {
  if (parent === null || parent === undefined || typeof parent !== "object") {
    return undefined;
  }

  const parentRecord = parent as Record<string, unknown>;
  return typeof parentRecord.key === "string" ? parentRecord.key : undefined;
}

function extractPriorityName(priority: unknown): string | undefined {
  if (priority === null || priority === undefined) return undefined;
  if (typeof priority !== "object") return undefined;
  const obj = priority as Record<string, unknown>;
  if (typeof obj.name === "string") return obj.name;
  return undefined;
}

function extractIssueTypeName(issueType: unknown): string | undefined {
  if (issueType === null || issueType === undefined) return undefined;
  if (typeof issueType !== "object") return undefined;
  const obj = issueType as Record<string, unknown>;
  if (typeof obj.name === "string") return obj.name;
  return undefined;
}

function extractIssueTypeIconUrl(issueType: unknown): string | undefined {
  if (issueType === null || issueType === undefined) return undefined;
  if (typeof issueType !== "object") return undefined;
  const obj = issueType as Record<string, unknown>;
  if (typeof obj.iconUrl === "string") return obj.iconUrl;
  return undefined;
}

function extractIssueTypeIsSubtask(issueType: unknown): boolean | undefined {
  if (issueType === null || issueType === undefined) return undefined;
  if (typeof issueType !== "object") return undefined;
  const obj = issueType as Record<string, unknown>;
  return typeof obj.subtask === "boolean" ? obj.subtask : undefined;
}

function extractLabels(labels: unknown): ReadonlyArray<string> | undefined {
  if (!Array.isArray(labels)) return undefined;
  const parsed = labels.filter((label): label is string => typeof label === "string");
  return parsed.length > 0 ? parsed : undefined;
}

function formatComments(comments: ReadonlyArray<JiraComment>): string {
  return comments
    .map((c) => {
      const author = c.author?.displayName ?? "Unknown";
      const body =
        typeof c.body === "string"
          ? c.body
          : convertAdfToMarkdown(c.body) || extractTextFromADF(c.body);
      return `**${author}**: ${body}`;
    })
    .join("\n\n");
}

function extractComments(commentField: unknown): ReadonlyArray<JiraComment> {
  if (commentField === null || commentField === undefined || typeof commentField !== "object") {
    return [];
  }
  const comments = (commentField as Record<string, unknown>).comments;
  return Array.isArray(comments) ? (comments as ReadonlyArray<JiraComment>) : [];
}

function extractDescriptionText(description: unknown): string | undefined {
  const text =
    typeof description === "string"
      ? description
      : convertAdfToMarkdown(description) || extractTextFromADF(description);

  return typeof text === "string" && text.trim().length > 0 ? text.trim() : undefined;
}

function extractEnvironmentText(environment: unknown): string | undefined {
  const text =
    typeof environment === "string"
      ? environment
      : convertAdfToMarkdown(environment) || extractTextFromADF(environment);

  return typeof text === "string" && text.trim().length > 0 ? text.trim() : undefined;
}

export function normalizeIssue(
  issue: JiraIssue,
  siteUrl: string,
  options?: {
    readonly estimateField?: JiraEstimateField | null;
    readonly sprintField?: JiraSprintField | null;
  },
): ResourceSnapshot {
  const fields = issue.fields;
  const key = issue.key;
  const summary = typeof fields.summary === "string" ? fields.summary : key;
  const descriptionText = extractDescriptionText(fields.description);
  const comments = extractComments(fields.comment);
  const renderedFields =
    issue && typeof issue === "object" && "renderedFields" in issue
      ? ((issue as Record<string, unknown>).renderedFields as Record<string, unknown> | undefined)
      : undefined;

  const status = extractStatusName(fields.status);
  const priority = extractPriorityName(fields.priority);
  const assignee = extractDisplayName(fields.assignee);
  const reporter = extractDisplayName(fields.reporter);
  const issueType = extractIssueTypeName(fields.issuetype);
  const issueTypeIconUrl = extractIssueTypeIconUrl(fields.issuetype);
  const labels = Array.isArray(fields.labels) ? (fields.labels as ReadonlyArray<string>) : [];
  const updated = typeof fields.updated === "string" ? fields.updated : isoNow();
  const attachments = Array.isArray(fields.attachment)
    ? (fields.attachment as ReadonlyArray<JiraAttachment>).map((attachment) => {
        const authorAccountId = attachment.author?.accountId;
        const avatarUrl = pickAvatarUrl(attachment.author?.avatarUrls);
        return {
          id: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          content: attachment.content,
          thumbnail: attachment.thumbnail,
          size: attachment.size,
          ...(authorAccountId ? { authorAccountId } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
        };
      })
    : [];

  const normalizedComments = comments.map((comment) => {
    const authorAccountId = comment.author?.accountId;
    const authorAvatarUrl = pickAvatarUrl(comment.author?.avatarUrls);
    const bodyAdf = extractAdfDocument(comment.body);
    const isInternal = typeof comment.jsdPublic === "boolean" ? !comment.jsdPublic : undefined;
    return {
      id: comment.id,
      author: comment.author?.displayName ?? "Unknown",
      created: comment.created,
      updated: comment.updated,
      bodyMarkdown:
        typeof comment.body === "string"
          ? comment.body
          : convertAdfToMarkdown(comment.body) || extractTextFromADF(comment.body),
      bodyHtml: (() => {
        if (
          !renderedFields ||
          typeof renderedFields.comment !== "object" ||
          !renderedFields.comment
        ) {
          return undefined;
        }
        const renderedComments = (renderedFields.comment as Record<string, unknown>).comments;
        if (!Array.isArray(renderedComments)) return undefined;
        const renderedEntry = renderedComments.find(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            typeof (entry as Record<string, unknown>).id === "string" &&
            (entry as Record<string, unknown>).id === comment.id,
        ) as Record<string, unknown> | undefined;
        return typeof renderedEntry?.body === "string" ? renderedEntry.body : undefined;
      })(),
      ...(authorAccountId ? { authorAccountId } : {}),
      ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
      ...(bodyAdf ? { bodyAdf } : {}),
      ...(isInternal !== undefined ? { isInternal } : {}),
    };
  });

  const commentsText = comments.length > 0 ? formatComments(comments) : "";

  const textParts: string[] = [];
  if (descriptionText) {
    textParts.push(descriptionText);
  }
  if (commentsText) {
    textParts.push("Comments:", commentsText);
  }

  const parentSummary = extractParentSummary(fields.parent);
  const storyPoints = readJiraEstimateValue(issue, options?.estimateField ?? null);
  const sprints = readJiraSprints(issue, options?.sprintField ?? null);
  const statusCategory = extractStatusCategory(fields.status);
  const descriptionAdf = extractAdfDocument(fields.description);
  const timeTracking = extractTimeTracking(fields);
  const watchCount = extractWatchCount(fields);
  const isWatching = extractIsWatching(fields);
  const voteCount = extractVoteCount(fields);
  const hasVoted = extractHasVoted(fields);
  const created = extractCreated(fields);
  const dueDate = extractDueDate(fields);
  const resolution = extractResolutionName(fields);
  const resolvedAt = extractResolvedAt(fields);
  const components = extractComponents(fields);
  const fixVersions = extractFixVersions(fields);
  const affectsVersions = extractAffectsVersions(fields);
  const environment = extractEnvironmentText(fields.environment);

  return {
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: key,
      parentId: extractParentKey(fields.parent),
      displayId: key,
      title: summary,
      url: `${siteUrl}/browse/${key}`,
      projectId:
        fields.project && typeof fields.project === "object"
          ? (fields.project as { id?: string }).id
          : undefined,
      ...(extractLabels(fields.labels) ? { labels: extractLabels(fields.labels) } : {}),
    },
    fetchedAt: isoNow(),
    summary: summary,
    fields: {
      status,
      priority,
      assignee,
      reporter,
      type: issueType,
      typeIconUrl: issueTypeIconUrl,
      labels,
      description: descriptionText,
      descriptionHtml:
        renderedFields && typeof renderedFields.description === "string"
          ? renderedFields.description
          : undefined,
      comments: commentsText,
      commentItems: normalizedComments,
      attachments,
      updated,
      ...(created !== undefined ? { created } : {}),
      ...(dueDate !== undefined ? { dueDate } : {}),
      ...(resolution !== undefined ? { resolution } : {}),
      ...(resolvedAt !== undefined ? { resolvedAt } : {}),
      ...(components !== undefined ? { components } : {}),
      ...(fixVersions !== undefined ? { fixVersions } : {}),
      ...(affectsVersions !== undefined ? { affectsVersions } : {}),
      ...(environment !== undefined ? { environment } : {}),
      ...(watchCount !== undefined ? { watchCount } : {}),
      ...(isWatching !== undefined ? { isWatching } : {}),
      ...(voteCount !== undefined ? { voteCount } : {}),
      ...(hasVoted !== undefined ? { hasVoted } : {}),
      ...(timeTracking !== undefined ? { timeTracking } : {}),
      ...(storyPoints !== undefined ? { storyPoints } : {}),
      ...(sprints.length > 0 ? { sprints } : {}),
      ...(statusCategory !== undefined ? { statusCategory } : {}),
      ...(descriptionAdf !== undefined ? { descriptionAdf } : {}),
      ...(parentSummary !== undefined ? { parentSummary } : {}),
    },
    text: textParts.join("\n\n"),
    raw: issue,
  };
}

export function normalizeIssueSearch(
  response: JiraIssueSearchResponse,
  siteUrl: string,
): ReadonlyArray<ExternalResourceRef> {
  return response.issues.map((issue) => {
    const jiraIssue = issue as JiraIssue;
    const key = jiraIssue.key;
    const summary = typeof jiraIssue.fields.summary === "string" ? jiraIssue.fields.summary : key;
    const projectId =
      jiraIssue.fields.project && typeof jiraIssue.fields.project === "object"
        ? (jiraIssue.fields.project as { id?: string }).id
        : undefined;

    return {
      provider: "atlassian",
      kind: "issue" as const,
      id: key,
      parentId: extractParentKey(jiraIssue.fields.parent),
      displayId: key,
      title: summary,
      ...(extractDescriptionText(jiraIssue.fields.description)
        ? { description: extractDescriptionText(jiraIssue.fields.description) }
        : {}),
      type: extractIssueTypeName(jiraIssue.fields.issuetype),
      issueTypeIconUrl: extractIssueTypeIconUrl(jiraIssue.fields.issuetype),
      ...(extractIssueTypeIsSubtask(jiraIssue.fields.issuetype) !== undefined
        ? { issueTypeIsSubtask: extractIssueTypeIsSubtask(jiraIssue.fields.issuetype) }
        : {}),
      url: `${siteUrl}/browse/${key}`,
      projectId,
      status: extractStatusName(jiraIssue.fields.status),
      priority: extractPriorityName(jiraIssue.fields.priority),
      assignee: extractDisplayName(jiraIssue.fields.assignee),
      updatedAt:
        typeof jiraIssue.fields.updated === "string" ? jiraIssue.fields.updated : undefined,
      ...(extractLabels(jiraIssue.fields.labels)
        ? { labels: extractLabels(jiraIssue.fields.labels) }
        : {}),
    };
  });
}
