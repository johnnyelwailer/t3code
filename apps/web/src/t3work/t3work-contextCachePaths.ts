import { T3WORK_PROJECT_CONTEXT_ROOT } from "~/t3work/t3work-projectSetup";

function sanitizePathSegment(input: string): string {
  const value = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return value.length > 0 ? value.slice(0, 80) : "item";
}

function joinRelativePath(root: string, leaf: string): string {
  return `${root}/${leaf}`;
}

function sanitizeFileLeaf(input: string): string {
  const trimmed = input.trim();
  const extension = trimmed.match(/\.[a-z0-9]{1,12}$/i)?.[0]?.toLowerCase() ?? "";
  const base = (extension ? trimmed.slice(0, -extension.length) : trimmed)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeBase = base.length > 0 ? base.slice(0, 80) : "asset";
  return `${safeBase}${extension}`;
}

export function buildProjectContextCacheRoot(_projectId: string): string {
  return T3WORK_PROJECT_CONTEXT_ROOT;
}

export function buildProjectContextEntryPoint(projectId: string): string {
  return joinRelativePath(buildProjectContextCacheRoot(projectId), "entrypoint.json");
}

export function buildJiraTicketCacheRoot(projectId: string, ticketKey: string): string {
  return `${T3WORK_PROJECT_CONTEXT_ROOT}/jira/${sanitizePathSegment(projectId)}/items/${sanitizePathSegment(ticketKey)}`;
}

export function buildJiraTicketEntryPoint(projectId: string, ticketKey: string): string {
  return joinRelativePath(buildJiraTicketCacheRoot(projectId, ticketKey), "entrypoint.json");
}

export function buildJiraTicketFocusEntryPoint(input: {
  projectId: string;
  ticketKey: string;
  focus: string;
}): string {
  return joinRelativePath(
    buildJiraTicketCacheRoot(input.projectId, input.ticketKey),
    `focus/${sanitizePathSegment(input.focus)}.json`,
  );
}

export function buildJiraTicketAttachmentsIndexPath(projectId: string, ticketKey: string): string {
  return joinRelativePath(buildJiraTicketCacheRoot(projectId, ticketKey), "attachments/index.json");
}

export function buildJiraTicketAttachmentAssetPath(input: {
  projectId: string;
  ticketKey: string;
  attachmentId?: string;
  filename: string;
}): string {
  const assetId = sanitizePathSegment(input.attachmentId ?? input.filename);
  return joinRelativePath(
    buildJiraTicketCacheRoot(input.projectId, input.ticketKey),
    `attachments/files/${assetId}-${sanitizeFileLeaf(input.filename)}`,
  );
}

export function buildGitHubActivityCacheRoot(input: {
  projectId: string;
  repository: string;
  activityId: string;
}): string {
  return `${T3WORK_PROJECT_CONTEXT_ROOT}/github/${sanitizePathSegment(input.projectId)}/${sanitizePathSegment(
    input.repository,
  )}/${sanitizePathSegment(input.activityId)}`;
}

export function buildGitHubActivityEntryPoint(input: {
  projectId: string;
  repository: string;
  activityId: string;
}): string {
  return joinRelativePath(buildGitHubActivityCacheRoot(input), "entrypoint.json");
}

export function buildContextManifestPath(root: string): string {
  return joinRelativePath(root, "manifest.json");
}

export function buildContextMetadataPath(root: string): string {
  return joinRelativePath(root, "metadata.json");
}

export { sanitizePathSegment };
