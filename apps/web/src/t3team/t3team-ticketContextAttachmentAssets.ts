import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { AddToChatPayloadProgressUpdate } from "~/t3team/t3team-addToChatUtils";
import {
  compactJson,
  type T3TeamDirectoryBundleFile,
} from "~/t3team/t3team-contextDirectoryBundle";
import {
  type AttachmentIndexState,
  collectAttachmentPlans,
  ensureAttachmentIndexState,
  messageFromCause,
} from "~/t3team/t3team-ticketContextAttachmentAssetPlans";
import type { TicketContextGraph } from "~/t3team/t3team-ticketContextGraph";

export type TicketAttachmentIndexInfo = {
  indexRelativePath: string;
  attachmentCount: number;
  downloadedCount: number;
  failedCount: number;
};

export type TicketContextAttachmentAssets = {
  files: T3TeamDirectoryBundleFile[];
  byTicketKey: ReadonlyMap<string, TicketAttachmentIndexInfo>;
};

export async function buildTicketContextAttachmentAssets(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  graph: TicketContextGraph;
  onProgress?: ((update: AddToChatPayloadProgressUpdate) => void) | undefined;
}): Promise<TicketContextAttachmentAssets> {
  const accountId = input.project.source.accountId;
  if (!accountId) {
    return { files: [], byTicketKey: new Map() };
  }

  const plans = collectAttachmentPlans({
    graph: input.graph,
    projectId: input.project.id,
  });
  if (plans.length === 0) {
    return { files: [], byTicketKey: new Map() };
  }

  const syncedAt = new Date().toISOString();
  const totalExpectedBytes = plans.reduce(
    (total, plan) => total + (plan.expectedSizeBytes ?? 0),
    0,
  );
  const files: T3TeamDirectoryBundleFile[] = [];
  const byTicketKey = new Map<string, AttachmentIndexState>();
  let downloadedBytes = 0;

  for (const [index, plan] of plans.entries()) {
    input.onProgress?.({
      phase: "Downloading Jira attachments",
      progressCurrent: index,
      progressTotal: plans.length,
      syncInfo: {
        contentLabel: "Jira work item context",
        currentItemLabel: plan.filename,
        currentItemDetail: plan.ticketKey,
        bytesCurrent: downloadedBytes,
        ...(totalExpectedBytes > 0 ? { bytesTotal: totalExpectedBytes } : {}),
      },
    });

    const ticketState = ensureAttachmentIndexState(byTicketKey, plan);
    try {
      const asset = await input.backend.atlassian.downloadAsset({
        accountId,
        url: plan.sourceUrl,
      });

      files.push({
        relativePath: plan.assetRelativePath,
        contents: asset.base64Contents,
        encoding: "base64",
        sizeBytes: asset.sizeBytes,
      });
      downloadedBytes += asset.sizeBytes;
      ticketState.attachments.push({
        ...(plan.id ? { id: plan.id } : {}),
        filename: plan.filename,
        ...((asset.mimeType ?? plan.mimeType) ? { mimeType: asset.mimeType ?? plan.mimeType } : {}),
        sourceUrl: plan.sourceUrl,
        ...(plan.thumbnailUrl ? { thumbnailUrl: plan.thumbnailUrl } : {}),
        sizeBytes: asset.sizeBytes,
        localPath: plan.assetRelativePath,
        status: "downloaded",
      });
    } catch (cause) {
      ticketState.attachments.push({
        ...(plan.id ? { id: plan.id } : {}),
        filename: plan.filename,
        ...(plan.mimeType ? { mimeType: plan.mimeType } : {}),
        sourceUrl: plan.sourceUrl,
        ...(plan.thumbnailUrl ? { thumbnailUrl: plan.thumbnailUrl } : {}),
        ...(typeof plan.expectedSizeBytes === "number"
          ? { sizeBytes: plan.expectedSizeBytes }
          : {}),
        status: "failed",
        error: messageFromCause(cause),
      });
    }
  }

  input.onProgress?.({
    phase: "Downloading Jira attachments",
    progressCurrent: plans.length,
    progressTotal: plans.length,
    syncInfo: {
      contentLabel: "Jira work item context",
      currentItemLabel: `${plans.length} attachment${plans.length === 1 ? "" : "s"} prepared`,
      bytesCurrent: downloadedBytes,
      ...(totalExpectedBytes > 0 ? { bytesTotal: totalExpectedBytes } : {}),
    },
  });

  const finalizedByTicketKey = new Map<string, TicketAttachmentIndexInfo>();
  for (const [ticketKey, state] of byTicketKey) {
    const downloadedCount = state.attachments.filter(
      (attachment) => attachment.status === "downloaded",
    ).length;
    const failedCount = state.attachments.length - downloadedCount;
    files.push({
      relativePath: state.indexRelativePath,
      contents: compactJson({
        kind: "jira-ticket-attachments-index",
        syncedAt,
        ticketKey,
        attachmentCount: state.attachments.length,
        downloadedCount,
        failedCount,
        attachments: state.attachments,
      }),
    });
    finalizedByTicketKey.set(ticketKey, {
      indexRelativePath: state.indexRelativePath,
      attachmentCount: state.attachments.length,
      downloadedCount,
      failedCount,
    });
  }

  return {
    files,
    byTicketKey: finalizedByTicketKey,
  };
}
