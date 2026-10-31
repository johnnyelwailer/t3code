import {
  CHANGE_REQUEST_FILE_ASSET,
  type ChangeRequestFileAssetResource,
  type EnvironmentId,
  type PullRequestRef,
} from "@t3tools/contracts";
import { diffImageMimeType, diffImageSides, type DiffImageSide } from "@t3tools/shared/diffImage";

import type { FilePreviewItem, FilePreviewSource } from "../../components/FilePreviewModal.types";
import type { NativeReviewDiffRow } from "../diffs/nativeReviewDiffSurface";
import type { NativeReviewDiffData } from "../review/nativeReviewDiffAdapter";
import type { ReviewParsedDiff, ReviewRenderableFile } from "../review/reviewModel";

export interface PullRequestDiffImage {
  readonly fileId: string;
  readonly rowId: string;
  readonly file: ReviewRenderableFile;
  readonly sides: ReadonlyArray<DiffImageSide>;
}

export interface PullRequestDiffImageTarget {
  readonly environmentId: EnvironmentId;
  readonly input: Pick<PullRequestRef, "projectId" | "repository" | "number" | "host">;
  readonly commit?: string | undefined;
}

export function pullRequestDiffImages(
  parsed: ReviewParsedDiff,
): ReadonlyArray<PullRequestDiffImage> {
  if (parsed.kind !== "files") return [];
  return parsed.files.flatMap((file) => {
    const sides = diffImageSides({
      path: file.path,
      changeType: file.changeType,
      lineCount: file.rows.length,
    });
    return sides.length === 0 ? [] : [{ fileId: file.id, rowId: `${file.id}:image`, file, sides }];
  });
}

/** Replaces each image file's "unsupported format" notice with a row the native list draws it in. */
export function withPullRequestImageRows(
  data: NativeReviewDiffData,
  images: ReadonlyArray<PullRequestDiffImage>,
): NativeReviewDiffData {
  if (images.length === 0) return data;
  const byFileId = new Map(images.map((image) => [image.fileId, image]));
  const rows = data.rows.flatMap((row): NativeReviewDiffRow[] => {
    const image = row.fileId === undefined ? undefined : byFileId.get(row.fileId);
    if (image === undefined) return [row];
    if (row.kind === "notice") return [];
    if (row.kind !== "file") return [row];
    return [row, { kind: "image", id: image.rowId, fileId: image.fileId, imageSides: image.sides }];
  });
  return { ...data, rows };
}

export function pullRequestDiffImageResource(
  target: PullRequestDiffImageTarget,
  image: PullRequestDiffImage,
  side: DiffImageSide,
): ChangeRequestFileAssetResource {
  return {
    _tag: CHANGE_REQUEST_FILE_ASSET,
    ...target.input,
    ...(target.commit ? { commit: target.commit } : {}),
    changeType: image.file.changeType,
    oldPath: image.file.previousPath ?? image.file.path,
    newPath: image.file.path,
    side,
  };
}

function galleryItem(
  target: PullRequestDiffImageTarget,
  image: PullRequestDiffImage,
  side: DiffImageSide,
): FilePreviewItem {
  const mimeType = diffImageMimeType(image.file.path);
  return {
    kind: "image",
    environmentId: target.environmentId,
    resource: pullRequestDiffImageResource(target, image, side),
    name: `${image.sides.length > 1 ? (side === "old" ? "Before: " : "After: ") : ""}${image.file.path}`,
    ...(mimeType ? { mimeType } : {}),
  };
}

/** Every image side of the change request, opened at the one pressed. */
export function pullRequestDiffImageGallery(
  target: PullRequestDiffImageTarget,
  images: ReadonlyArray<PullRequestDiffImage>,
  pressed: { readonly fileId: string; readonly side: DiffImageSide },
): FilePreviewSource | null {
  const pressedImage = images.find((image) => image.fileId === pressed.fileId);
  if (pressedImage === undefined || !pressedImage.sides.includes(pressed.side)) return null;
  const gallery = images.flatMap((image) =>
    image.sides.map((side) => galleryItem(target, image, side)),
  );
  return { ...galleryItem(target, pressedImage, pressed.side), gallery };
}
