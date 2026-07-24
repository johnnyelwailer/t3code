import {
  compactJson,
  isDirectoryBundlePayload,
  type AddToChatRequest,
} from "~/t3team/t3team-addToChatUtils";
import type { T3TeamContextAttachmentSyncItem } from "~/t3team/t3team-contextAttachment";

export type SyncWritePlanEntry = {
  id: string;
  label: string;
  detail: string;
  sizeBytes: number;
};

function measureTextBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function measureBase64Bytes(base64: string): number {
  const normalized = base64.replace(/\s+/g, "");
  if (normalized.length === 0) {
    return 0;
  }
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, (normalized.length * 3) / 4 - padding);
}

function getPathTail(relativePath: string): string {
  const segments = relativePath.split("/");
  return segments[segments.length - 1] ?? relativePath;
}

export function describeContextSyncContent(request: AddToChatRequest): string {
  if (request.kind === "project") {
    return "Project context";
  }
  if (request.kind === "jira-work-item") {
    return "Jira work item context";
  }
  if (request.kind?.startsWith("jira-ticket-")) {
    return "Jira ticket detail context";
  }
  if (request.kind?.startsWith("github-activity")) {
    return "GitHub activity context";
  }
  return `${request.targetType} context`;
}

export function buildSyncWritePlan(input: {
  request: AddToChatRequest;
  payload: unknown;
  relativePath?: string;
}): SyncWritePlanEntry[] {
  if (isDirectoryBundlePayload(input.payload)) {
    const referenceLabelByPath = new Map(
      input.payload.fileReferences.map(
        (reference) => [reference.relativePath, reference.label] as const,
      ),
    );

    return input.payload.files.map((file, index) => ({
      id: `${input.request.dedupeKey ?? input.request.targetLabel}:${index}`,
      label: referenceLabelByPath.get(file.relativePath) ?? getPathTail(file.relativePath),
      detail: file.relativePath,
      sizeBytes:
        file.sizeBytes ??
        (file.encoding === "base64"
          ? measureBase64Bytes(file.contents)
          : measureTextBytes(file.contents)),
    }));
  }

  if (!input.relativePath) {
    return [];
  }

  return [
    {
      id: `${input.request.dedupeKey ?? input.request.targetLabel}:snapshot`,
      label: getPathTail(input.relativePath),
      detail: input.relativePath,
      sizeBytes: measureTextBytes(compactJson(input.payload)),
    },
  ];
}

export function buildSyncItemsFromPlan(input: {
  plan: ReadonlyArray<SyncWritePlanEntry>;
  completedCount: number;
  activeIndex?: number;
}): T3TeamContextAttachmentSyncItem[] {
  return input.plan.map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    detail: entry.detail,
    status:
      index < input.completedCount
        ? "completed"
        : index === input.activeIndex
          ? "active"
          : "pending",
    sizeBytes: entry.sizeBytes,
  }));
}
