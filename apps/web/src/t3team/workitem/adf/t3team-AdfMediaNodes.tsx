import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { safeAdfHref } from "./t3team-adfLinkTargets";
import { T3TeamAdfNodes } from "./t3team-adfNodeRegistry";
import {
  adfAttrNumber,
  adfAttrString,
  adfChildren,
  type AdfNode,
  type AdfNodeProps,
  type AdfNodeRenderers,
  type AdfRenderContext,
} from "./t3team-adfRendererTypes";

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(?:[?#]|$)/i;

const MEDIA_SINGLE_LAYOUT_CLASSES: Readonly<Record<string, string>> = {
  center: "mx-auto w-fit",
  "wrap-left": "mr-auto w-fit",
  "align-start": "mr-auto w-fit",
  "wrap-right": "ml-auto w-fit",
  "align-end": "ml-auto w-fit",
  wide: "w-full",
  "full-width": "w-full",
};

/**
 * ADF media carries a Media Services id rather than a URL, so we hand the host resolver
 * every plausible key (external URL, attachment-content path, filename) and take the first
 * one it rewrites. `createJiraTicketAssetUrlResolver` returns its input unchanged on a miss,
 * which is exactly the signal we need — and we never build a second resolver here.
 *
 * A rewritten URL is produced by the host application, so it is trusted as-is. A URL that
 * came straight out of the document is untrusted and must clear `safeAdfHref`.
 */
function resolveMediaSrc(node: AdfNode, ctx: AdfRenderContext): string | undefined {
  const url = adfAttrString(node, "url");
  const id = adfAttrString(node, "id");
  const alt = adfAttrString(node, "alt");
  const resolve = ctx.resolveAssetUrl;
  if (resolve !== undefined) {
    const idPath = id === undefined ? undefined : `/rest/api/3/attachment/content/${id}`;
    for (const candidate of [url, idPath, alt]) {
      if (candidate === undefined) continue;
      const resolved = resolve(candidate);
      if (resolved !== candidate && resolved.trim().length > 0) return resolved.trim();
    }
  }
  return safeAdfHref(url);
}

function looksLikeImage(node: AdfNode): boolean {
  const alt = adfAttrString(node, "alt") ?? "";
  const url = adfAttrString(node, "url") ?? "";
  if (IMAGE_EXTENSION_PATTERN.test(alt) || IMAGE_EXTENSION_PATTERN.test(url)) return true;
  // Jira omits the filename on pasted screenshots but always sizes displayable media.
  return adfAttrNumber(node, "width") !== undefined && adfAttrNumber(node, "height") !== undefined;
}

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

  if (!looksLikeImage(node)) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="inline-flex max-w-full items-center rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-info-foreground"
      >
        <span className="truncate">{alt ?? src}</span>
      </a>
    );
  }

  return (
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
