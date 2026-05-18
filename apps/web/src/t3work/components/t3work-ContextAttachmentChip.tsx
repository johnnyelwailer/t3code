import { XIcon } from "lucide-react";
import {
  FALLBACK_KIND_CONFIG,
  KIND_CONFIGS,
} from "~/t3work/components/t3work-ContextAttachmentChipConfig";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import { cn } from "~/lib/utils";

type ContextAttachmentChipProps = {
  attachment: T3WorkContextAttachment;
  onRemove?: ((id: string) => void) | undefined;
};

export function ContextAttachmentChip({ attachment, onRemove }: ContextAttachmentChipProps) {
  const config = KIND_CONFIGS[attachment.kind] ?? FALLBACK_KIND_CONFIG;
  const { Icon, iconClassName, chipClassName, badgeClassName } = config;
  const detailText = attachment.kind.startsWith("github-activity")
    ? undefined
    : attachment.description;
  const title = [
    `${config.label}: ${attachment.label}`,
    ...(attachment.summaryItems?.map((s) => `${s.label}: ${s.value}`) ?? []),
    ...(attachment.fileReferences?.map((r) => `${r.label}: ${r.relativePath}`) ?? []),
  ].join("\n");

  return (
    <div
      className={cn(
        "group flex max-w-xs items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
        chipClassName,
      )}
      title={title.length > 0 ? title : undefined}
    >
      <Icon className={cn("size-3.5 shrink-0", iconClassName)} />
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
  attachments: ReadonlyArray<T3WorkContextAttachment>;
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
