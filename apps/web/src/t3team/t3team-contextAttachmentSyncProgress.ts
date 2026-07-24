import {
  buildContextAttachment,
  type AddToChatPayloadProgressUpdate,
  type AddToChatRequest,
} from "~/t3team/t3team-addToChatUtils";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import {
  buildSyncItemsFromPlan,
  buildSyncWritePlan,
  describeContextSyncContent,
} from "~/t3team/t3team-contextAttachmentSyncPlan";

export function buildInitialSyncProgressUpdate(input: {
  request: AddToChatRequest;
  startedAt: string;
}): AddToChatPayloadProgressUpdate {
  return {
    phase: "Preparing context data",
    progressCurrent: 0,
    progressTotal: 1,
    syncInfo: {
      startedAt: input.startedAt,
      contentLabel: describeContextSyncContent(input.request),
      currentItemLabel: input.request.targetLabel,
      currentItemDetail: input.request.projectTitle,
      items: [
        {
          id: `${input.request.dedupeKey ?? input.request.targetLabel}:prepare`,
          label: input.request.targetLabel,
          detail: input.request.projectTitle,
          status: "active",
        },
      ],
    },
  };
}

export function buildWriteProgressUpdate(input: {
  request: AddToChatRequest;
  payload: unknown;
  startedAt: string;
  relativePath?: string;
  completedCount: number;
  activeIndex?: number;
}): AddToChatPayloadProgressUpdate {
  const plan = buildSyncWritePlan({
    request: input.request,
    payload: input.payload,
    ...(input.relativePath ? { relativePath: input.relativePath } : {}),
  });
  const bytesCurrent = plan
    .slice(0, input.completedCount)
    .reduce((total, entry) => total + entry.sizeBytes, 0);
  const bytesTotal = plan.reduce((total, entry) => total + entry.sizeBytes, 0);
  const activeEntry =
    typeof input.activeIndex === "number"
      ? plan[input.activeIndex]
      : plan[input.completedCount - 1];

  return {
    phase: plan.length === 1 ? "Saving cached context file" : "Saving cached context files",
    progressCurrent: input.completedCount,
    progressTotal: plan.length,
    syncInfo: {
      startedAt: input.startedAt,
      contentLabel: describeContextSyncContent(input.request),
      ...(activeEntry
        ? { currentItemLabel: activeEntry.label, currentItemDetail: activeEntry.detail }
        : {}),
      bytesCurrent,
      bytesTotal,
      items: buildSyncItemsFromPlan({
        plan,
        completedCount: input.completedCount,
        ...(typeof input.activeIndex === "number" ? { activeIndex: input.activeIndex } : {}),
      }),
    },
  };
}

export function buildSyncProgressAttachment(input: {
  attachmentId: string;
  request: AddToChatRequest;
  update: AddToChatPayloadProgressUpdate;
  payload?: unknown;
  relativePath?: string;
  startedAt: string;
}): T3TeamContextAttachment {
  return buildContextAttachment({
    id: input.attachmentId,
    request: input.request,
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
    ...(input.relativePath ? { relativePath: input.relativePath } : {}),
    syncStatus: "syncing",
    syncPhase: input.update.phase,
    ...(typeof input.update.progressCurrent === "number"
      ? { syncProgressCurrent: input.update.progressCurrent }
      : {}),
    ...(typeof input.update.progressTotal === "number"
      ? { syncProgressTotal: input.update.progressTotal }
      : {}),
    syncInfo: {
      startedAt: input.startedAt,
      contentLabel:
        input.update.syncInfo?.contentLabel ?? describeContextSyncContent(input.request),
      ...(input.update.syncInfo?.currentItemLabel
        ? { currentItemLabel: input.update.syncInfo.currentItemLabel }
        : {}),
      ...(input.update.syncInfo?.currentItemDetail
        ? { currentItemDetail: input.update.syncInfo.currentItemDetail }
        : {}),
      ...(typeof input.update.syncInfo?.bytesCurrent === "number"
        ? { bytesCurrent: input.update.syncInfo.bytesCurrent }
        : {}),
      ...(typeof input.update.syncInfo?.bytesTotal === "number"
        ? { bytesTotal: input.update.syncInfo.bytesTotal }
        : {}),
      ...(input.update.syncInfo?.items ? { items: input.update.syncInfo.items } : {}),
    },
  });
}
