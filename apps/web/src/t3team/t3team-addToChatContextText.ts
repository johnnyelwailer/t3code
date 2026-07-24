import {
  ADDED_CONTEXT_FOOTER,
  ADDED_CONTEXT_HEADING,
} from "~/t3team/t3team-contextAttachmentPrimitives";

export function buildContextAttachmentText(input: {
  targetLabel: string;
  kind: string;
  targetType: string;
  projectTitle: string;
  bundleRootRelativePath?: string;
  fileReferences?: ReadonlyArray<{ label: string; relativePath: string }>;
  relativePath?: string;
  summaryItems?: ReadonlyArray<{ label: string; value: string }>;
  syncStatus?: "syncing" | "synced" | "error";
  syncPhase?: string;
  syncProgressCurrent?: number;
  syncProgressTotal?: number;
  syncInfo?: {
    contentLabel?: string;
    currentItemLabel?: string;
    currentItemDetail?: string;
    bytesCurrent?: number;
    bytesTotal?: number;
  };
  syncedAt?: string;
  syncError?: string;
  jiraIssueType?: string;
  jiraIssueTypeIconUrl?: string;
}): string {
  const lines: string[] = [];
  lines.push(`${ADDED_CONTEXT_HEADING} ${input.targetLabel}`);
  lines.push("");
  lines.push(`- Kind: ${input.kind}`);
  lines.push(`- Type: ${input.targetType}`);
  lines.push(`- Project: ${input.projectTitle}`);
  if (input.syncStatus) {
    lines.push(`- Sync status: ${input.syncStatus}`);
  }
  if (input.syncPhase) {
    lines.push(`- Sync phase: ${input.syncPhase}`);
  }
  if (input.syncInfo?.contentLabel) {
    lines.push(`- Sync content: ${input.syncInfo.contentLabel}`);
  }
  if (input.syncInfo?.currentItemLabel) {
    lines.push(
      `- Sync item: ${input.syncInfo.currentItemLabel}${input.syncInfo.currentItemDetail ? ` (${input.syncInfo.currentItemDetail})` : ""}`,
    );
  }
  if (
    typeof input.syncProgressCurrent === "number" &&
    typeof input.syncProgressTotal === "number"
  ) {
    lines.push(`- Sync progress: ${input.syncProgressCurrent}/${input.syncProgressTotal}`);
  }
  if (
    typeof input.syncInfo?.bytesCurrent === "number" &&
    typeof input.syncInfo.bytesTotal === "number"
  ) {
    lines.push(`- Sync size: ${input.syncInfo.bytesCurrent}/${input.syncInfo.bytesTotal} bytes`);
  }
  if (input.syncedAt) {
    lines.push(`- Synced at: ${input.syncedAt}`);
  }
  if (input.syncError) {
    lines.push(`- Sync error: ${input.syncError}`);
  }
  if (input.bundleRootRelativePath) {
    lines.push(`- Context cache directory: ${input.bundleRootRelativePath}`);
    if (input.fileReferences && input.fileReferences.length > 0) {
      lines.push("- References:");
      for (const reference of input.fileReferences) {
        lines.push(`  - ${reference.label}: ${reference.relativePath}`);
      }
    }
  } else if (input.relativePath) {
    lines.push(`- Snapshot file: ${input.relativePath}`);
  }
  for (const item of input.summaryItems ?? []) {
    lines.push(`- ${item.label}: ${item.value}`);
  }
  if (input.jiraIssueType) {
    lines.push(`- Issue type: ${input.jiraIssueType}`);
  }
  if (input.jiraIssueTypeIconUrl) {
    lines.push(`- Issue type icon url: ${input.jiraIssueTypeIconUrl}`);
  }
  lines.push("");
  lines.push(ADDED_CONTEXT_FOOTER);
  return lines.join("\n");
}
