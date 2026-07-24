import { useEffect, useState } from "react";
import { AlertCircleIcon, CheckCircle2Icon, Clock3Icon, DownloadIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import type {
  T3TeamContextAttachment,
  T3TeamContextAttachmentSyncItem,
} from "~/t3team/t3team-contextAttachment";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatElapsed(startedAt: string, now: number): string {
  const elapsedMs = Math.max(0, now - new Date(startedAt).getTime());
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s elapsed`;
  }
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${seconds}s elapsed`;
}

function resolveProgressPercent(attachment: T3TeamContextAttachment): number | undefined {
  const bytesCurrent = attachment.syncInfo?.bytesCurrent;
  const bytesTotal = attachment.syncInfo?.bytesTotal;
  if (typeof bytesCurrent === "number" && typeof bytesTotal === "number" && bytesTotal > 0) {
    return Math.max(0, Math.min(100, (bytesCurrent / bytesTotal) * 100));
  }

  if (
    typeof attachment.syncProgressCurrent === "number" &&
    typeof attachment.syncProgressTotal === "number" &&
    attachment.syncProgressTotal > 0
  ) {
    return Math.max(
      0,
      Math.min(100, (attachment.syncProgressCurrent / attachment.syncProgressTotal) * 100),
    );
  }

  return undefined;
}

function resolveActiveItem(
  items: ReadonlyArray<T3TeamContextAttachmentSyncItem>,
): T3TeamContextAttachmentSyncItem | undefined {
  return items.find((item) => item.status === "active") ?? items[items.length - 1];
}

function SyncMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/70 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-medium text-foreground/90">{value}</div>
    </div>
  );
}

function SyncItemRow({ item }: { item: T3TeamContextAttachmentSyncItem }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/50 bg-background/65 px-2 py-1.5">
      {item.status === "completed" ? (
        <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-emerald-500/80" />
      ) : item.status === "active" ? (
        <DownloadIcon className="mt-0.5 size-3.5 shrink-0 -rotate-6 animate-[pulse_2.8s_ease-in-out_infinite] text-sky-500/85" />
      ) : (
        <span className="mt-[5px] inline-flex size-2 shrink-0 rounded-full bg-muted-foreground/30" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-foreground/90">{item.label}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/75">
          {item.detail ? <span className="truncate">{item.detail}</span> : null}
          {typeof item.sizeBytes === "number" ? <span>{formatBytes(item.sizeBytes)}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function ContextAttachmentSyncTooltip({
  attachment,
}: {
  attachment: T3TeamContextAttachment;
}) {
  const [now, setNow] = useState(() => Date.now());
  const items = attachment.syncInfo?.items ?? [];
  const activeItem = resolveActiveItem(items);
  const progressPercent = resolveProgressPercent(attachment);
  const completedCount =
    typeof attachment.syncProgressCurrent === "number"
      ? attachment.syncProgressCurrent
      : items.filter((item) => item.status === "completed").length;
  const totalCount =
    typeof attachment.syncProgressTotal === "number" ? attachment.syncProgressTotal : items.length;

  useEffect(() => {
    if (attachment.syncStatus !== "syncing" || !attachment.syncInfo?.startedAt) {
      return;
    }
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [attachment.syncInfo?.startedAt, attachment.syncStatus]);

  const itemsValue =
    totalCount > 0 ? `${completedCount}/${totalCount} items` : `${completedCount} item updates`;
  const sizeValue =
    typeof attachment.syncInfo?.bytesCurrent === "number" &&
    typeof attachment.syncInfo?.bytesTotal === "number"
      ? `${formatBytes(attachment.syncInfo.bytesCurrent)} / ${formatBytes(attachment.syncInfo.bytesTotal)}`
      : typeof activeItem?.sizeBytes === "number"
        ? formatBytes(activeItem.sizeBytes)
        : "Pending";

  return (
    <div className="w-80 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
          {attachment.syncStatus === "error" ? (
            <AlertCircleIcon className="size-3.5 text-destructive/80" />
          ) : (
            <DownloadIcon className="size-3.5 -rotate-6 text-sky-500/85" />
          )}
          <span>
            {attachment.syncStatus === "error"
              ? "Context sync failed"
              : `Syncing ${attachment.syncInfo?.contentLabel ?? "context"}`}
          </span>
        </div>
        <div className="text-sm font-medium leading-snug text-foreground/95">
          {attachment.label}
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/80 p-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-foreground/90">
              {attachment.syncPhase ?? "Syncing context"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground/75">
              {attachment.syncInfo?.currentItemLabel ??
                activeItem?.label ??
                "Waiting for next step"}
            </div>
            {(attachment.syncInfo?.currentItemDetail ?? activeItem?.detail) ? (
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground/65">
                {attachment.syncInfo?.currentItemDetail ?? activeItem?.detail}
              </div>
            ) : null}
          </div>
          {attachment.syncInfo?.startedAt ? (
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[10px] text-muted-foreground/75">
              <Clock3Icon className="size-3" />
              <span>{formatElapsed(attachment.syncInfo.startedAt, now)}</span>
            </div>
          ) : null}
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              attachment.syncStatus === "error" ? "bg-destructive/75" : "bg-sky-500/75",
            )}
            style={{ width: `${progressPercent ?? 12}%` }}
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <SyncMetric label="Items" value={itemsValue} />
          <SyncMetric label="Size" value={sizeValue} />
        </div>
      </div>

      {items.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
            Planned Work
          </div>
          <div className="space-y-1.5">
            {items.slice(0, 6).map((item) => (
              <SyncItemRow key={item.id} item={item} />
            ))}
            {items.length > 6 ? (
              <div className="px-1 text-[10px] text-muted-foreground/65">
                +{items.length - 6} more item{items.length - 6 === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {attachment.syncError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/8 px-2.5 py-2 text-[11px] leading-5 text-destructive/90">
          {attachment.syncError}
        </div>
      ) : null}
    </div>
  );
}
