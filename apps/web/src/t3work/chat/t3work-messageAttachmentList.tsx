import { BoxIcon, FileImageIcon, FileTextIcon, LinkIcon, PanelsTopLeftIcon } from "lucide-react";
import type { T3workMessageAttachment } from "@t3tools/contracts";

function AttachmentLink(props: { label: string; url: string | undefined }) {
  if (!props.url) {
    return <span className="font-medium text-foreground">{props.label}</span>;
  }

  return (
    <a
      href={props.url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-foreground underline decoration-border underline-offset-4 hover:text-foreground/80"
    >
      {props.label}
    </a>
  );
}

function formatSize(sizeBytes: number | undefined): string | null {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return null;
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAttachmentMeta(parts: ReadonlyArray<string | null | undefined>) {
  const values = parts.filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  if (values.length === 0) {
    return null;
  }

  return <p className="text-xs text-muted-foreground">{values.join(" • ")}</p>;
}

function renderAttachmentBody(attachment: T3workMessageAttachment) {
  switch (attachment.kind) {
    case "file":
      return (
        <>
          <AttachmentLink label={attachment.file.label} url={attachment.file.url} />
          {renderAttachmentMeta([attachment.file.mimeType, formatSize(attachment.file.sizeBytes)])}
        </>
      );
    case "image":
      return (
        <>
          <AttachmentLink label={attachment.image.label} url={attachment.image.url} />
          {renderAttachmentMeta([
            attachment.alt,
            attachment.image.mimeType,
            formatSize(attachment.image.sizeBytes),
          ])}
        </>
      );
    case "resource": {
      const resource = "ref" in attachment.resource ? attachment.resource.ref : attachment.resource;
      return (
        <>
          <AttachmentLink label={resource.title} url={resource.url} />
          {renderAttachmentMeta([
            resource.provider,
            resource.kind,
            resource.displayId,
            resource.status,
          ])}
        </>
      );
    }
    case "artifact":
      return (
        <>
          <AttachmentLink label={attachment.artifact.label} url={attachment.artifact.url} />
          {renderAttachmentMeta([
            attachment.artifact.kind,
            attachment.artifact.path,
            attachment.artifact.summary,
          ])}
        </>
      );
    case "view":
      return (
        <>
          <span className="font-medium text-foreground">{attachment.miniappId}</span>
          {renderAttachmentMeta(["View attachment"])}
        </>
      );
  }
}

function attachmentIcon(attachment: T3workMessageAttachment) {
  switch (attachment.kind) {
    case "file":
      return FileTextIcon;
    case "image":
      return FileImageIcon;
    case "resource":
      return LinkIcon;
    case "artifact":
      return BoxIcon;
    case "view":
      return PanelsTopLeftIcon;
  }
}

export function T3workMessageAttachmentList(props: {
  attachments: ReadonlyArray<T3workMessageAttachment>;
}) {
  if (props.attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      {props.attachments.map((attachment, index) => {
        const Icon = attachmentIcon(attachment);
        return (
          <div
            key={`t3work-attachment:${attachment.kind}:${index}`}
            className="flex items-start gap-3 rounded-lg border border-border/55 bg-background/65 px-3 py-2"
          >
            <div className="mt-0.5 rounded-md border border-border/60 p-1 text-muted-foreground">
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 space-y-1">{renderAttachmentBody(attachment)}</div>
          </div>
        );
      })}
    </div>
  );
}
