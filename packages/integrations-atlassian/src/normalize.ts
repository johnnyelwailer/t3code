import type {
  ExternalProject,
  IntegrationAccount,
  IntegrationAccountRef,
} from "@t3tools/integrations-core";
import type { ExternalResourceRef, ResourceSnapshot } from "@t3tools/project-context";
import * as DateTime from "effect/DateTime";
import type { JiraComment, JiraIssue, JiraIssueSearchResponse, JiraProject } from "./client.ts";

type AdfMark = {
  readonly type?: string;
  readonly attrs?: Record<string, unknown>;
};

type AdfNode = {
  readonly type?: string;
  readonly text?: string;
  readonly attrs?: Record<string, unknown>;
  readonly marks?: ReadonlyArray<AdfMark>;
  readonly content?: ReadonlyArray<AdfNode>;
};

type JiraAttachment = {
  readonly id?: string;
  readonly filename?: string;
  readonly mimeType?: string;
  readonly content?: string;
  readonly thumbnail?: string;
  readonly size?: number;
};

function isoNow(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

function pickAvatarUrl(avatarUrls: Record<string, string> | undefined): string | undefined {
  if (!avatarUrls) return undefined;
  return (
    avatarUrls["48x48"] ??
    avatarUrls["32x32"] ??
    avatarUrls["24x24"] ??
    Object.values(avatarUrls)[0]
  );
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

function extractTextFromADF(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node !== "object") return "";

  const obj = node as Record<string, unknown>;

  if (obj.text && typeof obj.text === "string") {
    return obj.text;
  }

  if (Array.isArray(obj.content)) {
    return obj.content.map(extractTextFromADF).join("");
  }

  return "";
}

function applyMarkdownMarks(text: string, marks: ReadonlyArray<AdfMark> | undefined): string {
  if (!marks || marks.length === 0 || text.length === 0) return text;

  return marks.reduce((current, mark) => {
    switch (mark.type) {
      case "strong":
        return `**${current}**`;
      case "em":
        return `*${current}*`;
      case "strike":
        return `~~${current}~~`;
      case "code":
        return `\`${current}\``;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        return href ? `[${current}](${href})` : current;
      }
      default:
        return current;
    }
  }, text);
}

function stringifyAdfInline(node: AdfNode): string {
  if (node.type === "text") {
    return applyMarkdownMarks(node.text ?? "", node.marks);
  }

  if (node.type === "hardBreak") {
    return "\\n";
  }

  if (node.type === "emoji") {
    return typeof node.attrs?.text === "string" ? node.attrs.text : "";
  }

  if (node.type === "inlineCard" || node.type === "mention") {
    const label =
      typeof node.attrs?.text === "string"
        ? node.attrs.text
        : typeof node.attrs?.title === "string"
          ? node.attrs.title
          : "link";
    const href = typeof node.attrs?.url === "string" ? node.attrs.url : "";
    return href ? `[${label}](${href})` : label;
  }

  const children = Array.isArray(node.content)
    ? node.content.map((child) => stringifyAdfInline(child)).join("")
    : "";
  return applyMarkdownMarks(children, node.marks);
}

function stringifyAdfList(
  nodes: ReadonlyArray<AdfNode> | undefined,
  depth: number,
  ordered: boolean,
): string {
  if (!nodes || nodes.length === 0) return "";
  const prefixBase = "  ".repeat(Math.max(0, depth));

  return nodes
    .map((item, index) => {
      if (item.type !== "listItem") {
        return stringifyAdfBlock(item, depth + 1);
      }

      const marker = ordered ? `${index + 1}. ` : "- ";
      const children = item.content ?? [];
      const renderedChildren = children
        .map((child) => stringifyAdfBlock(child, depth + 1))
        .filter((value) => value.length > 0);

      if (renderedChildren.length === 0) {
        return `${prefixBase}${marker}`;
      }

      const [first = "", ...rest] = renderedChildren;
      const firstLine = first.replace(/^\s+/, "");
      const restText = rest
        .map((entry) =>
          entry
            .split("\n")
            .map((line) => (line.length > 0 ? `${prefixBase}  ${line}` : ""))
            .join("\n"),
        )
        .join("\n");

      return [`${prefixBase}${marker}${firstLine}`, restText]
        .filter((segment) => segment.length > 0)
        .join("\n");
    })
    .join("\n");
}

function stringifyAdfBlock(node: AdfNode, depth = 0): string {
  switch (node.type) {
    case "paragraph":
      return (node.content ?? [])
        .map((child) => stringifyAdfInline(child))
        .join("")
        .trimEnd();
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      const safeLevel = Math.min(Math.max(level, 1), 6);
      return `${"#".repeat(safeLevel)} ${(node.content ?? [])
        .map((child) => stringifyAdfInline(child))
        .join("")}`.trimEnd();
    }
    case "bulletList":
      return stringifyAdfList(node.content, depth, false);
    case "orderedList":
      return stringifyAdfList(node.content, depth, true);
    case "blockquote": {
      const raw = (node.content ?? []).map((child) => stringifyAdfBlock(child, depth)).join("\n");
      return raw
        .split("\n")
        .map((line) => (line.length > 0 ? `> ${line}` : ">"))
        .join("\n");
    }
    case "rule":
      return "---";
    case "codeBlock": {
      const code = (node.content ?? []).map((child) => child.text ?? "").join("");
      const language = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return `\`\`\`${language}\n${code}\n\`\`\``;
    }
    case "panel": {
      const panelType = typeof node.attrs?.panelType === "string" ? node.attrs.panelType : "info";
      const body = (node.content ?? [])
        .map((child) => stringifyAdfBlock(child, depth))
        .join("\n\n");
      return `> [!${panelType.toUpperCase()}]\n> ${body.replace(/\n/g, "\n> ")}`;
    }
    default:
      return stringifyAdfInline(node).trimEnd();
  }
}

function convertAdfToMarkdown(document: unknown): string {
  if (!document || typeof document !== "object") return "";
  const root = document as AdfNode;
  const content = Array.isArray(root.content) ? root.content : [];

  return content
    .map((node) => stringifyAdfBlock(node))
    .filter((line) => line.length > 0)
    .join("\n\n")
    .trim();
}

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

export function normalizeIssue(issue: JiraIssue, siteUrl: string): ResourceSnapshot {
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
    ? (fields.attachment as ReadonlyArray<JiraAttachment>).map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        content: attachment.content,
        thumbnail: attachment.thumbnail,
        size: attachment.size,
      }))
    : [];

  const normalizedComments = comments.map((comment) => ({
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
  }));

  const commentsText = comments.length > 0 ? formatComments(comments) : "";

  const textParts: string[] = [];
  if (descriptionText) {
    textParts.push(descriptionText);
  }
  if (commentsText) {
    textParts.push("Comments:", commentsText);
  }

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
