/**
 * Media an explainer may show. A model writes these, so a source can never point at an arbitrary
 * URL — loading one would leak that the reader opened it. A source is either an attachment the
 * host resolves (`attachment:<id>`) or a small inline `data:` payload of a safe type.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./t3team-explainerBaseSchemas";

/** About 150 KB of image once base64 is unpacked. */
export const T3TEAM_EXPLAINER_INLINE_MEDIA_MAX_CHARS = 200_000;

const ATTACHMENT = /^attachment:[\w.-]{1,120}$/;
const INLINE_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const INLINE_VIDEO = /^data:video\/(?:mp4|webm);base64,[A-Za-z0-9+/]+={0,2}$/;
const INLINE_CAPTIONS = /^data:text\/vtt;base64,[A-Za-z0-9+/]+={0,2}$/;
// A blob: URL is minted by this page for a local file; the browser keeps it same-origin.
const BLOB = /^blob:[\w.:/-]{1,300}$/;

const source = (...patterns: ReadonlyArray<RegExp>) =>
  TrimmedNonEmptyString.check(
    Schema.isMaxLength(T3TEAM_EXPLAINER_INLINE_MEDIA_MAX_CHARS),
    Schema.makeFilter(
      (value: string) =>
        patterns.some((pattern) => pattern.test(value)) ||
        "Use attachment:<id> or an inline data: URL of an allowed type.",
    ),
  );

export const T3TeamExplainerImageSource = source(ATTACHMENT, INLINE_IMAGE);
export const T3TeamExplainerVideoSource = source(ATTACHMENT, INLINE_VIDEO, BLOB);
export const T3TeamExplainerCaptionsSource = source(ATTACHMENT, INLINE_CAPTIONS, BLOB);

/** The attachment id a source names, or null for an inline source. */
export function t3teamExplainerAttachmentId(src: string): string | null {
  return src.startsWith("attachment:") ? src.slice("attachment:".length) : null;
}

export const T3TeamExplainerImage = Schema.Struct({
  src: T3TeamExplainerImageSource,
  alt: TrimmedNonEmptyString,
  caption: Schema.optionalKey(Schema.String),
});
export type T3TeamExplainerImage = typeof T3TeamExplainerImage.Type;

export const T3TeamExplainerVideo = Schema.Struct({
  src: T3TeamExplainerVideoSource,
  /** What the clip shows, for readers who cannot watch it. */
  alt: TrimmedNonEmptyString,
  poster: Schema.optionalKey(T3TeamExplainerImageSource),
  captions: Schema.optionalKey(
    Schema.Struct({ src: T3TeamExplainerCaptionsSource, lang: Schema.optionalKey(Schema.String) }),
  ),
  caption: Schema.optionalKey(Schema.String),
  /** Plays muted on its own only when the reader allows motion. */
  autoplay: Schema.optionalKey(Schema.Boolean),
  /** Off by default: a clip that loops forever repaints forever. */
  loop: Schema.optionalKey(Schema.Boolean),
});
export type T3TeamExplainerVideo = typeof T3TeamExplainerVideo.Type;
