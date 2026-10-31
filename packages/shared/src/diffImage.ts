import { mediaKindFromPath, mediaMimeType } from "./mediaPreview.ts";

export type DiffFileChangeType = "change" | "rename-pure" | "rename-changed" | "new" | "deleted";
export type DiffImageSide = "old" | "new";

/** The image mime type of a changed file's path, or null when the path is not an image. */
export function diffImageMimeType(path: string): string | null {
  return mediaKindFromPath(path) === "image" ? mediaMimeType(path) : null;
}

function changedSides(changeType: DiffFileChangeType): ReadonlyArray<DiffImageSide> {
  switch (changeType) {
    case "new":
    case "rename-pure":
      return ["new"];
    case "deleted":
      return ["old"];
    case "change":
    case "rename-changed":
      return ["old", "new"];
  }
}

/**
 * The sides of a changed image to show in place of its diff. Empty when the file is not an image
 * or the patch carries text lines for it, as an SVG's does.
 */
export function diffImageSides(file: {
  readonly path: string;
  readonly changeType: DiffFileChangeType;
  readonly lineCount: number;
}): ReadonlyArray<DiffImageSide> {
  return file.lineCount === 0 && diffImageMimeType(file.path) !== null
    ? changedSides(file.changeType)
    : [];
}
