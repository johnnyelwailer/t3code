/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import { AlertCircleIcon, DownloadIcon, XIcon } from "lucide-react";
import {
  FALLBACK_KIND_CONFIG,
  KIND_CONFIGS,
} from "~/t3team/components/t3team-ContextAttachmentChipConfig";
import { ContextAttachmentSyncTooltip } from "~/t3team/components/t3team-ContextAttachmentSyncTooltip";
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import { cn } from "~/lib/utils";

type ContextAttachmentChipProps = {
  attachment: T3TeamContextAttachment;
  onRemove?: ((id: string) => void) | undefined;
};

export function ContextAttachmentChip({ attachment, onRemove }: ContextAttachmentChipProps) {
  const config = KIND_CONFIGS[attachment.kind] ?? FALLBACK_KIND_CONFIG;
  const { Icon, iconClassName, chipClassName, badgeClassName } = config;
  const detailText =
    attachment.syncStatus === "error"
      ? attachment.syncError
      : attachment.kind.startsWith("github-activity")
        ? undefined
        : attachment.description;
  const title = [
    `${config.label}: ${attachment.label}`,
    ...(attachment.syncStatus ? [`Sync status: ${attachment.syncStatus}`] : []),
    ...(attachment.syncPhase ? [`Sync phase: ${attachment.syncPhase}`] : []),
    ...(attachment.syncInfo?.contentLabel
      ? [`Sync content: ${attachment.syncInfo.contentLabel}`]
      : []),
    ...(attachment.syncInfo?.currentItemLabel
      ? [
          `Sync item: ${attachment.syncInfo.currentItemLabel}${attachment.syncInfo.currentItemDetail ? ` (${attachment.syncInfo.currentItemDetail})` : ""}`,
        ]
      : []),
    ...(typeof attachment.syncProgressCurrent === "number" &&
    typeof attachment.syncProgressTotal === "number"
      ? [`Sync progress: ${attachment.syncProgressCurrent}/${attachment.syncProgressTotal}`]
      : []),
    ...(typeof attachment.syncInfo?.bytesCurrent === "number" &&
    typeof attachment.syncInfo.bytesTotal === "number"
      ? [`Sync size: ${attachment.syncInfo.bytesCurrent}/${attachment.syncInfo.bytesTotal} bytes`]
      : []),
    ...(attachment.syncError ? [`Sync error: ${attachment.syncError}`] : []),
    ...(attachment.summaryItems?.map((s) => `${s.label}: ${s.value}`) ?? []),
    ...(attachment.fileReferences?.map((r) => `${r.label}: ${r.relativePath}`) ?? []),
  ].join("\n");
  const hasSyncIndicator = attachment.syncStatus === "syncing" || attachment.syncStatus === "error";

  return (
    <div
      className={cn(
        // The chip floats above timeline content in the composer accessory; an opaque base plus
        // backdrop blur keeps the low-alpha provider tint readable instead of letting chat text
        // bleed through it.
        "group flex max-w-xs items-center gap-1.5 rounded-md border bg-background/80 px-2 py-1 text-xs backdrop-blur-md transition-colors",
        chipClassName,
        attachment.syncStatus === "error" && "border-destructive/40 bg-destructive/5",
      )}
      title={title.length > 0 ? title : undefined}
    >
      {attachment.kind.startsWith("jira-") && attachment.jiraIssueType ? (
        <JiraIssueTypeIcon
          issueType={attachment.jiraIssueType}
          {...(attachment.jiraIssueTypeIconUrl
            ? { issueTypeIconUrl: attachment.jiraIssueTypeIconUrl }
            : {})}
          className="size-3.5 rounded-[3px]"
        />
      ) : (
        <Icon className={cn("size-3.5 shrink-0", iconClassName)} />
      )}
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-medium leading-tight text-foreground/90">
          {attachment.label}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]",
              badgeClassName,
            )}
          >
            {config.label}
          </span>
          {hasSyncIndicator && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className="inline-flex items-center rounded-sm text-muted-foreground/65"
                    aria-label={
                      attachment.syncStatus === "syncing"
                        ? "Syncing context"
                        : "Context sync failed"
                    }
                  />
                }
              >
                {attachment.syncStatus === "error" ? (
                  <AlertCircleIcon className="size-3 text-destructive/75" />
                ) : (
                  <DownloadIcon className="size-3 -rotate-6 animate-[pulse_3.6s_ease-in-out_infinite] text-muted-foreground/55" />
                )}
              </TooltipTrigger>
              <TooltipPopup side="top" align="start" className="max-w-none">
                <ContextAttachmentSyncTooltip attachment={attachment} />
              </TooltipPopup>
            </Tooltip>
          )}
          {detailText && (
            <span className="truncate text-[10px] leading-tight text-muted-foreground/80">
              {detailText}
            </span>
          )}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${attachment.label}`}
          className="ml-0.5 shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground/80 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => onRemove(attachment.id)}
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  );
}

type ContextAttachmentStripProps = {
  attachments: ReadonlyArray<T3TeamContextAttachment>;
  onRemove?: ((id: string) => void) | undefined;
};

export function ContextAttachmentStrip({ attachments, onRemove }: ContextAttachmentStripProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <ContextAttachmentChip key={a.id} attachment={a} onRemove={onRemove} />
      ))}
    </div>
  );
}
