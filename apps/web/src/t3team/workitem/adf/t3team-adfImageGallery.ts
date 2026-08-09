import type { T3TeamLightboxImage } from "~/t3team/components/media/t3team-imageLightboxState";
import { classifyAdfMediaNode, resolveMediaSrc } from "./t3team-adfMediaResolution";
import {
  adfAttrString,
  adfChildren,
  type AdfNode,
  type AdfRenderContext,
} from "./t3team-adfRendererTypes";

const MEDIA_NODE_TYPES = new Set(["media", "mediaInline"]);

/** Defensive cap: a hostile or pathologically large document should not produce an unbounded
 * gallery array. Real Jira descriptions never come close to this. */
const MAX_GALLERY_IMAGES = 200;

/**
 * Walks an ADF node list collecting every displayable image, in document order, for the
 * lightbox gallery. Iterative (a stack, not recursion) for the same reason every other ADF
 * walk in this renderer is: a hostile or pathologically deep document must not blow the stack.
 * Mirrors exactly what `T3TeamAdfMedia` would render as an `<img>`, so gallery order and index
 * always match what the user actually sees.
 */
export function collectAdfGalleryImages(
  nodes: readonly AdfNode[],
  ctx: AdfRenderContext,
): T3TeamLightboxImage[] {
  const images: T3TeamLightboxImage[] = [];
  const stack: AdfNode[] = nodes.toReversed();

  while (stack.length > 0 && images.length < MAX_GALLERY_IMAGES) {
    const node = stack.pop();
    if (node === undefined) continue;

    if (MEDIA_NODE_TYPES.has(node.type) && classifyAdfMediaNode(node) === "image") {
      const src = resolveMediaSrc(node, ctx);
      if (src !== undefined) {
        images.push({ src, alt: adfAttrString(node, "alt") ?? "Image" });
      }
      continue;
    }

    const children = adfChildren(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) stack.push(child);
    }
  }

  return images;
}
