import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { workItemAttachmentGlyph } from "~/t3team/workitem/t3team-WorkItemAttachmentTile";
import { classifyAdfMediaNode, resolveMediaSrc } from "./t3team-adfMediaResolution";
import { T3TeamAdfNodes } from "./t3team-adfNodeRegistry";
import {
  adfAttrNumber,
  adfAttrString,
  adfChildren,
  type AdfNodeProps,
  type AdfNodeRenderers,
} from "./t3team-adfRendererTypes";

const MEDIA_CHIP_CLASS =
  "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-info-foreground";

/** A screen recording should not dominate the column the way a native-resolution `<img>` would. */
function T3TeamAdfMediaVideo({
  src,
  alt,
}: {
  readonly src: string;
  readonly alt: string | undefined;
}): ReactNode {
  return (
    <video
      src={src}
      controls
      preload="metadata"
      playsInline
      aria-label={alt}
      className="h-auto max-h-[70vh] max-w-full rounded-md border border-border/70"
      data-adf-node="media-video"
    />
  );
}

function T3TeamAdfMediaAudio({ src }: { readonly src: string }): ReactNode {
  return (
    <audio
      src={src}
      controls
      preload="metadata"
      className="w-full max-w-full"
      data-adf-node="media-audio"
    />
  );
}

/** Everything that isn't an image/video/audio (pdf, zip, docx, …): a file chip, never inlined. */
function T3TeamAdfMediaFileChip({
  src,
  alt,
}: {
  readonly src: string;
  readonly alt: string | undefined;
}): ReactNode {
  const Glyph = workItemAttachmentGlyph({ filename: alt });
  return (
    <a href={src} target="_blank" rel="noreferrer" className={MEDIA_CHIP_CLASS}>
      <Glyph className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{alt ?? src}</span>
    </a>
  );
}

const MEDIA_SINGLE_LAYOUT_CLASSES: Readonly<Record<string, string>> = {
  center: "mx-auto w-fit",
  "wrap-left": "mr-auto w-fit",
  "align-start": "mr-auto w-fit",
  "wrap-right": "ml-auto w-fit",
  "align-end": "ml-auto w-fit",
  wide: "w-full",
  "full-width": "w-full",
};

function T3TeamAdfMedia({ node, ctx }: AdfNodeProps): ReactNode {
  const src = resolveMediaSrc(node, ctx);
  const alt = adfAttrString(node, "alt");
  if (src === undefined) {
    // Nothing resolvable: show the filename as a quiet attachment chip, or nothing at all.
    if (alt === undefined) return null;
    return (
      <span className="inline-flex max-w-full items-center rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
        <span className="truncate">{alt}</span>
      </span>
    );
  }

  // Branch on what this actually is before picking an element — an `<img>` cannot play a video,
  // and a video/file chip must never inherit the media node's own width/height attrs (those are
  // the *image's* intrinsic size, not a sizing hint for a player or a chip).
  const kind = classifyAdfMediaNode(node);
  if (kind === "video") return <T3TeamAdfMediaVideo src={src} alt={alt} />;
  if (kind === "audio") return <T3TeamAdfMediaAudio src={src} />;
  if (kind === "file") return <T3TeamAdfMediaFileChip src={src} alt={alt} />;

  const img = (
    <img
      src={src}
      alt={alt ?? ""}
      width={adfAttrNumber(node, "width")}
      height={adfAttrNumber(node, "height")}
      loading="lazy"
      decoding="async"
      className="h-auto max-w-full rounded-md border border-border/70"
      data-adf-node="media"
    />
  );

  // No lightbox wired up (e.g. a bare `<T3TeamAdfRenderer>` in a context that never renders
  // one) -> just the image, same as before.
  const openImage = ctx.onOpenImage;
  if (openImage === undefined) return img;

  return (
    <button
      type="button"
      className="block max-w-full cursor-zoom-in rounded-md text-left"
      aria-label={alt ? `View image: ${alt}` : "View image"}
      onClick={() => openImage(src)}
    >
      {img}
    </button>
  );
}

function T3TeamAdfMediaSingle({ node, ctx, depth }: AdfNodeProps): ReactNode {
  const layout = adfAttrString(node, "layout") ?? "center";
  return (
    <div
      className={cn("max-w-full", MEDIA_SINGLE_LAYOUT_CLASSES[layout] ?? "mr-auto w-fit")}
      data-adf-node="mediaSingle"
    >
      <T3TeamAdfNodes nodes={adfChildren(node)} ctx={ctx} depth={depth} />
    </div>
  );
}

function T3TeamAdfMediaGroup({ node, ctx, depth }: AdfNodeProps): ReactNode {
  return (
    <div className="flex flex-wrap items-start gap-2" data-adf-node="mediaGroup">
      <T3TeamAdfNodes nodes={adfChildren(node)} ctx={ctx} depth={depth} />
    </div>
  );
}

export const adfMediaNodeRenderers: AdfNodeRenderers = {
  media: T3TeamAdfMedia,
  mediaInline: T3TeamAdfMedia,
  mediaSingle: T3TeamAdfMediaSingle,
  mediaGroup: T3TeamAdfMediaGroup,
};
