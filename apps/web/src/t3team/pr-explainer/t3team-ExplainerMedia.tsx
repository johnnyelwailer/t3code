import { ImageOffIcon } from "./t3team-explainerHostKit";
import type {
  T3TeamExplainerImageBlock,
  T3TeamExplainerVideoBlock,
} from "./model/t3team-explainer";
import { t3teamExplainerAttachmentId } from "./model/t3team-explainer";
import { useExplainer } from "./t3team-explainerContext";

/**
 * The URL to load for a media source. Inline `data:`/`blob:` sources were checked by the model
 * schema; an attachment is whatever the host resolves it to, or null when it cannot.
 */
export function useExplainerMediaUrl(src: string | undefined): string | null {
  const { resolveAttachment } = useExplainer();
  if (src === undefined) return null;
  const attachment = t3teamExplainerAttachmentId(src);
  if (attachment === null) return src;
  return resolveAttachment?.(attachment) ?? null;
}

export function ExplainerMediaMissing({ alt }: { alt: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-4 text-center text-2xs text-muted-foreground">
      <ImageOffIcon aria-hidden className="size-3.5 shrink-0" />
      <span>Not available here: {alt}</span>
    </div>
  );
}

function Caption({ text }: { text: string | undefined }) {
  return text ? (
    <figcaption className="mt-1 line-clamp-2 text-2xs text-muted-foreground">{text}</figcaption>
  ) : null;
}

export function ExplainerImageBlock({ block }: { block: T3TeamExplainerImageBlock }) {
  const url = useExplainerMediaUrl(block.src);
  return (
    <figure className="min-w-0">
      {url ? (
        <img
          src={url}
          alt={block.alt}
          className="mx-auto block h-auto max-h-80 w-auto max-w-full rounded-md border border-border"
        />
      ) : (
        <ExplainerMediaMissing alt={block.alt} />
      )}
      <Caption text={block.caption} />
    </figure>
  );
}

/**
 * A short clip. It plays on its own only when asked to and the reader allows motion, always
 * muted, and loops only when the explainer says so.
 */
export function ExplainerVideoBlock({ block }: { block: T3TeamExplainerVideoBlock }) {
  const { reducedMotion } = useExplainer();
  const url = useExplainerMediaUrl(block.src);
  const poster = useExplainerMediaUrl(block.poster);
  const captions = useExplainerMediaUrl(block.captions?.src);
  const autoPlay = (block.autoplay ?? false) && !reducedMotion;
  return (
    <figure className="min-w-0">
      {url ? (
        <video
          src={url}
          aria-label={block.alt}
          poster={poster ?? undefined}
          controls
          muted
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
          loop={block.loop ?? false}
          className="block max-h-80 w-full rounded-md border border-border bg-black/80"
        >
          {captions ? (
            <track kind="captions" src={captions} srcLang={block.captions?.lang ?? "en"} default />
          ) : null}
        </video>
      ) : (
        <ExplainerMediaMissing alt={block.alt} />
      )}
      <Caption text={block.caption} />
    </figure>
  );
}
