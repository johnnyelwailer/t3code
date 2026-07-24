import { buildJiraTicketAttachmentsIndexPath } from "~/t3team/t3team-contextCachePaths";
import {
  buildTicketAttachmentCacheRelativePath,
  normalizeTicketAttachments,
  sanitizeTicketAttachmentFileName,
} from "~/t3team/t3team-ticketAttachmentUtils";
import type { TicketContextGraph } from "~/t3team/t3team-ticketContextGraph";

export type AttachmentPlan = {
  ticketKey: string;
  id?: string;
  filename: string;
  mimeType?: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  expectedSizeBytes?: number;
  assetRelativePath: string;
  indexRelativePath: string;
};

type AttachmentIndexEntry = {
  id?: string;
  filename: string;
  mimeType?: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  sizeBytes?: number;
  localPath?: string;
  status: "downloaded" | "failed";
  error?: string;
};

export type AttachmentIndexState = {
  ticketKey: string;
  indexRelativePath: string;
  attachments: AttachmentIndexEntry[];
};

export function messageFromCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function collectAttachmentPlans(input: {
  graph: TicketContextGraph;
  projectId: string;
}): AttachmentPlan[] {
  const plans: AttachmentPlan[] = [];

  for (const node of input.graph.nodes.values()) {
    const snapshotFields = node.snapshot?.fields as Record<string, unknown> | undefined;
    const snapshotAttachments = snapshotFields?.attachments;
    const rawAttachments = Array.isArray(snapshotAttachments)
      ? snapshotAttachments.filter(
          (attachment): attachment is Record<string, unknown> =>
            attachment !== null && typeof attachment === "object",
        )
      : [];
    const attachments = normalizeTicketAttachments(rawAttachments);

    for (const attachment of attachments) {
      const sourceUrl = attachment.content?.trim() || attachment.thumbnail?.trim();
      if (!sourceUrl) {
        continue;
      }
      const filename = sanitizeTicketAttachmentFileName({
        ...(attachment.filename ? { filename: attachment.filename } : {}),
        ...(attachment.id ? { attachmentId: attachment.id } : {}),
        ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
      });

      plans.push({
        ticketKey: node.key,
        ...(attachment.id ? { id: attachment.id } : {}),
        filename,
        ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
        sourceUrl,
        ...(attachment.thumbnail ? { thumbnailUrl: attachment.thumbnail } : {}),
        ...(typeof attachment.size === "number" ? { expectedSizeBytes: attachment.size } : {}),
        assetRelativePath: buildTicketAttachmentCacheRelativePath({
          projectId: input.projectId,
          ticketKey: node.key,
          attachment: {
            ...attachment,
            filename,
          },
        }),
        indexRelativePath: buildJiraTicketAttachmentsIndexPath(input.projectId, node.key),
      });
    }
  }

  return plans;
}

export function ensureAttachmentIndexState(
  byTicketKey: Map<string, AttachmentIndexState>,
  plan: AttachmentPlan,
): AttachmentIndexState {
  const existing = byTicketKey.get(plan.ticketKey);
  if (existing) {
    return existing;
  }

  const created: AttachmentIndexState = {
    ticketKey: plan.ticketKey,
    indexRelativePath: plan.indexRelativePath,
    attachments: [],
  };
  byTicketKey.set(plan.ticketKey, created);
  return created;
}
