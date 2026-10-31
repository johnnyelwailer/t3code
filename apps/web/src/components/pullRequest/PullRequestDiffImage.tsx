import type { FileDiffMetadata } from "@pierre/diffs";
import type { EnvironmentId, PullRequestRef } from "@t3tools/contracts";
import {
  changeRequestFileResource,
  diffImageMimeType,
  diffImageSides,
  type DiffImageSide,
} from "@t3tools/shared/diffImage";
import { useState } from "react";

import { useAssetUrls } from "~/assets/assetUrls";
import { resolveFileDiffPath } from "~/lib/diffRendering";
import { ExpandedImageDialog } from "../chat/ExpandedImageDialog";
import { AttachmentImage } from "../media/AttachmentImage";

export function pullRequestDiffImageSides(fileDiff: FileDiffMetadata) {
  return diffImageSides({
    path: resolveFileDiffPath(fileDiff),
    changeType: fileDiff.type,
    lineCount: fileDiff.hunks.length,
  });
}

function sideName(side: DiffImageSide, sides: ReadonlyArray<DiffImageSide>, path: string) {
  if (sides.length < 2) return path;
  return `${side === "old" ? "Before" : "After"}: ${path}`;
}

/** A changed image in place of the diff its patch cannot carry, before and after side by side. */
export function PullRequestDiffImage(props: {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
  readonly commit: string | null;
  readonly fileDiff: FileDiffMetadata;
  readonly sides: ReadonlyArray<DiffImageSide>;
}) {
  const path = resolveFileDiffPath(props.fileDiff);
  const file = {
    path,
    previousPath: props.fileDiff.prevName ?? null,
    changeType: props.fileDiff.type,
  };
  const urls = useAssetUrls(
    props.environmentId,
    props.sides.map((side) =>
      changeRequestFileResource({ ref: props.reference, commit: props.commit, file, side }),
    ),
  );
  const [expanded, setExpanded] = useState<number | null>(null);
  const [failed, setFailed] = useState<ReadonlySet<DiffImageSide>>(() => new Set());
  const mimeType = diffImageMimeType(path) ?? undefined;
  const images = props.sides.map((side, index) => ({
    src: urls[index] ?? null,
    name: sideName(side, props.sides, path),
    ...(mimeType ? { mimeType } : {}),
  }));
  return (
    <div className="flex gap-3 p-3 font-sans">
      {props.sides.map((side, index) => {
        const src = urls[index] ?? null;
        return (
          <figure key={side} className="flex min-w-0 flex-1 flex-col gap-1">
            {props.sides.length > 1 ? (
              <figcaption
                className={side === "old" ? "text-xs text-destructive" : "text-xs text-success"}
              >
                {side === "old" ? "Before" : "After"}
              </figcaption>
            ) : null}
            <button
              type="button"
              aria-label={`Expand ${images[index]?.name ?? path}`}
              disabled={src === null || failed.has(side)}
              className="flex h-64 cursor-zoom-in items-center justify-center overflow-hidden rounded-md bg-muted/40 disabled:cursor-default"
              onClick={() => setExpanded(index)}
            >
              {failed.has(side) ? (
                <span className="text-xs text-muted-foreground">Preview unavailable</span>
              ) : src === null ? (
                <span className="text-xs text-muted-foreground">Loading image…</span>
              ) : (
                <AttachmentImage
                  src={src}
                  name={path}
                  mimeType={mimeType}
                  alt={images[index]?.name ?? path}
                  className="max-h-full max-w-full object-contain"
                  onError={() => setFailed((current) => new Set(current).add(side))}
                />
              )}
            </button>
          </figure>
        );
      })}
      {expanded !== null ? (
        <ExpandedImageDialog
          preview={{ images, index: expanded }}
          onClose={() => setExpanded(null)}
        />
      ) : null}
    </div>
  );
}
