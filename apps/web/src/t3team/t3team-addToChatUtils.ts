import { randomUUID } from "~/lib/utils";
import { buildContextAttachmentText } from "~/t3team/t3team-addToChatContextText";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import type { T3TeamDirectoryBundlePayload } from "~/t3team/t3team-contextDirectoryBundle";
import {
  inferContextAttachmentKindFromType,
  normalizeContextAttachmentKind,
} from "~/t3team/t3team-contextAttachmentPrimitives";
import { resolveJiraContextAttachmentMetadata } from "~/t3team/t3team-jiraContextMetadata";

export type AddToChatRequest = {
  projectId: string;
  projectTitle: string;
  projectWorkspaceRoot?: string | undefined;
  targetLabel: string;
  targetType: string;
  kind?: string;
  jiraIssueType?: string;
  jiraIssueTypeIconUrl?: string;
  dedupeKey?: string;
  payload: unknown | ((input?: AddToChatPayloadInput) => Promise<unknown>);
  summaryItems?: ReadonlyArray<{ label: string; value: string }>;
};

export type AddToChatPayloadProgressUpdate = {
  phase: string;
  progressCurrent?: number;
  progressTotal?: number;
  syncInfo?: T3TeamContextAttachment["syncInfo"];
};

export type AddToChatPayloadInput = {
  reportProgress?: (update: AddToChatPayloadProgressUpdate) => void;
};

export function sanitizeForFileName(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base.slice(0, 64) : "context";
}

export function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function isDirectoryBundlePayload(
  payload: unknown,
): payload is T3TeamDirectoryBundlePayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return (
    candidate.kind === "t3team-directory-bundle" &&
    typeof candidate.dedupeKey === "string" &&
    typeof candidate.bundleRootRelativePath === "string" &&
    Array.isArray(candidate.files) &&
    Array.isArray(candidate.fileReferences)
  );
}

function resolveAttachmentKind(request: AddToChatRequest, payload: unknown): string {
  const explicitRequestKind = normalizeContextAttachmentKind(request.kind);
  if (explicitRequestKind) {
    return explicitRequestKind;
  }
  if (isDirectoryBundlePayload(payload)) {
    const lightweight = payload.lightweightItem;
    if (lightweight && typeof lightweight === "object" && "kind" in lightweight) {
      const k = normalizeContextAttachmentKind(
        (lightweight as Record<string, unknown>).kind as string | undefined,
      );
      if (k) return k;
    }
  }
  if (payload && typeof payload === "object" && "kind" in payload) {
    const k = normalizeContextAttachmentKind(
      (payload as Record<string, unknown>).kind as string | undefined,
    );
    if (k) return k;
  }
  return inferContextAttachmentKindFromType(request.targetType);
}

export function buildContextAttachment(input: {
  request: AddToChatRequest;
  relativePath?: string | undefined;
  payload?: unknown;
  id?: string;
  syncStatus?: T3TeamContextAttachment["syncStatus"];
  syncPhase?: string;
  syncProgressCurrent?: number;
  syncProgressTotal?: number;
  syncInfo?: T3TeamContextAttachment["syncInfo"];
  syncedAt?: string;
  syncError?: string;
}): T3TeamContextAttachment {
  const { request, relativePath, payload } = input;
  const kind = resolveAttachmentKind(request, payload);
  const jiraMetadata = resolveJiraContextAttachmentMetadata({
    ...(request.kind ? { kind: request.kind } : {}),
    ...(request.jiraIssueType ? { jiraIssueType: request.jiraIssueType } : {}),
    ...(request.jiraIssueTypeIconUrl ? { jiraIssueTypeIconUrl: request.jiraIssueTypeIconUrl } : {}),
    ...(request.summaryItems ? { summaryItems: request.summaryItems } : {}),
  });
  const dedupeKey =
    request.dedupeKey ?? (isDirectoryBundlePayload(payload) ? payload.dedupeKey : undefined);
  const description = request.summaryItems?.[0]
    ? `${request.summaryItems[0].label}: ${request.summaryItems[0].value}`
    : undefined;
  const fileReferences = isDirectoryBundlePayload(payload) ? payload.fileReferences : undefined;
  const bundleRootRelativePath = isDirectoryBundlePayload(payload)
    ? payload.bundleRootRelativePath
    : undefined;
  return {
    id: input.id ?? randomUUID(),
    kind,
    label: request.targetLabel,
    ...(jiraMetadata.jiraIssueType ? { jiraIssueType: jiraMetadata.jiraIssueType } : {}),
    ...(jiraMetadata.jiraIssueTypeIconUrl
      ? { jiraIssueTypeIconUrl: jiraMetadata.jiraIssueTypeIconUrl }
      : {}),
    ...(dedupeKey ? { dedupeKey } : {}),
    ...(description ? { description } : {}),
    ...(request.summaryItems ? { summaryItems: request.summaryItems } : {}),
    ...(fileReferences ? { fileReferences } : {}),
    ...(input.syncStatus ? { syncStatus: input.syncStatus } : {}),
    ...(input.syncPhase ? { syncPhase: input.syncPhase } : {}),
    ...(typeof input.syncProgressCurrent === "number"
      ? { syncProgressCurrent: input.syncProgressCurrent }
      : {}),
    ...(typeof input.syncProgressTotal === "number"
      ? { syncProgressTotal: input.syncProgressTotal }
      : {}),
    ...(input.syncInfo ? { syncInfo: input.syncInfo } : {}),
    ...(input.syncedAt ? { syncedAt: input.syncedAt } : {}),
    ...(input.syncError ? { syncError: input.syncError } : {}),
    contextText: buildContextAttachmentText({
      targetLabel: request.targetLabel,
      kind,
      targetType: request.targetType,
      projectTitle: request.projectTitle,
      ...(bundleRootRelativePath ? { bundleRootRelativePath } : {}),
      ...(fileReferences ? { fileReferences } : {}),
      ...(relativePath ? { relativePath } : {}),
      ...(request.summaryItems ? { summaryItems: request.summaryItems } : {}),
      ...(input.syncStatus ? { syncStatus: input.syncStatus } : {}),
      ...(input.syncPhase ? { syncPhase: input.syncPhase } : {}),
      ...(typeof input.syncProgressCurrent === "number"
        ? { syncProgressCurrent: input.syncProgressCurrent }
        : {}),
      ...(typeof input.syncProgressTotal === "number"
        ? { syncProgressTotal: input.syncProgressTotal }
        : {}),
      ...(input.syncInfo ? { syncInfo: input.syncInfo } : {}),
      ...(input.syncedAt ? { syncedAt: input.syncedAt } : {}),
      ...(input.syncError ? { syncError: input.syncError } : {}),
      ...(jiraMetadata.jiraIssueType ? { jiraIssueType: jiraMetadata.jiraIssueType } : {}),
      ...(jiraMetadata.jiraIssueTypeIconUrl
        ? { jiraIssueTypeIconUrl: jiraMetadata.jiraIssueTypeIconUrl }
        : {}),
    }),
  };
}

export function buildPendingContextAttachment(input: {
  request: AddToChatRequest;
  id?: string;
}): T3TeamContextAttachment {
  return buildContextAttachment({
    request: input.request,
    ...(input.id ? { id: input.id } : {}),
    syncStatus: "syncing",
    syncPhase: "Preparing context bundle",
  });
}
