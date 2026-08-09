import { classifyMediaKind, type T3TeamMediaKind } from "~/t3team/lib/t3team-mediaKind";
import { safeAdfHref } from "./t3team-adfLinkTargets";
import { adfAttrNumber, adfAttrString, type AdfNode, type AdfRenderContext } from "./t3team-adfRendererTypes";

/**
 * ADF media carries a Media Services id rather than a URL, so we hand the host resolver
 * every plausible key (external URL, attachment-content path, filename) and take the first
 * one it rewrites. `createJiraTicketAssetUrlResolver` returns its input unchanged on a miss,
 * which is exactly the signal we need — and we never build a second resolver here.
 *
 * A rewritten URL is produced by the host application, so it is trusted as-is. A URL that
 * came straight out of the document is untrusted and must clear `safeAdfHref`.
 *
 * Deliberately its own module, with no import of the node registry: both `T3TeamAdfMedia` and
 * the gallery collector (`t3team-adfImageGallery.ts`) need this, and importing it from one
 * another instead would re-enter the renderer/media circular import at a different point and
 * silently drop the media node registrations (a real bug this module split fixes).
 */
export function resolveMediaSrc(node: AdfNode, ctx: AdfRenderContext): string | undefined {
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

/** Whether a string ends in something that *looks* like a file extension, recognised or not —
 * used to tell "no filename at all" apart from "a filename with an extension we don't know". */
function hasExtensionLikeSuffix(value: string | undefined): boolean {
  return value !== undefined && /\.[a-z0-9]+$/i.test(value);
}

/**
 * Which element `T3TeamAdfMedia` should render. Real Jira media attrs carry a mime type under
 * `__fileMimeType` (occasionally just `mimeType`); when that's absent the filename lives under
 * `__fileName` or, failing that, `alt` — and some media only carry an image-extension `url`
 * with no filename-ish `alt` at all (an externally embedded image). `classifyMediaKind` is the
 * single source of truth for mime/extension -> kind, shared with the attachment tile glyph
 * picker; this function is just about *which string(s)* to feed it, in priority order.
 *
 * The width/height-implies-image fallback only fires when NONE of mime type, filename, or url
 * gave any extension-shaped signal at all — a pasted screenshot Jira never names. It must not
 * fire just because the extension went unrecognised: video attachments carry width/height too (a
 * screen recording has dimensions), so a `.mp4` — or any other named-but-unrecognised file — must
 * stay classified by its actual name, never get silently promoted to "image" because a size
 * happened to be present.
 */
export function classifyAdfMediaNode(node: AdfNode): T3TeamMediaKind {
  const mimeType = adfAttrString(node, "__fileMimeType") ?? adfAttrString(node, "mimeType");
  const filename = adfAttrString(node, "__fileName") ?? adfAttrString(node, "alt");
  const url = adfAttrString(node, "url");

  const byName = classifyMediaKind({ mimeType, filename });
  if (byName !== "file" || mimeType !== undefined || hasExtensionLikeSuffix(filename)) {
    return byName;
  }

  const byUrl = classifyMediaKind({ filename: url });
  if (byUrl !== "file" || hasExtensionLikeSuffix(url)) return byUrl;

  const hasDimensions =
    adfAttrNumber(node, "width") !== undefined && adfAttrNumber(node, "height") !== undefined;
  return hasDimensions ? "image" : "file";
}
