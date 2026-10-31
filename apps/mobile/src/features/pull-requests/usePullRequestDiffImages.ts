import { useEffect, useMemo, useState } from "react";
import type { NativeSyntheticEvent } from "react-native";

import type { FilePreviewSource } from "../../components/FilePreviewModal.types";
import { refreshAssetUrl } from "../../state/assets";
import type { ReviewParsedDiff } from "../review/reviewModel";
import {
  pullRequestDiffImageGallery,
  pullRequestDiffImageResource,
  pullRequestDiffImages,
  type PullRequestDiffImageTarget,
} from "./pullRequestDiffImages";
import { pullRequestTarget, type PullRequestDiffParams } from "./usePullRequestDiff";

type ImageUris = Record<string, { old?: string; new?: string }>;

export function usePullRequestDiffImages(params: PullRequestDiffParams, parsed: ReviewParsedDiff) {
  const { environmentId, projectId, repository, number, host, commit } = params;
  const target = useMemo(
    (): PullRequestDiffImageTarget => ({
      ...pullRequestTarget({ environmentId, projectId, repository, number, host }),
      commit,
    }),
    [environmentId, projectId, repository, number, host, commit],
  );
  const images = useMemo(() => pullRequestDiffImages(parsed), [parsed]);
  const [imageUrisJson, setImageUrisJson] = useState("{}");
  const [preview, setPreview] = useState<FilePreviewSource | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- signed URLs are minted by the server, asynchronously
  useEffect(() => {
    if (images.length === 0) return;
    const controller = new AbortController();
    const sides = images.flatMap((image) => image.sides.map((side) => ({ image, side })));
    void Promise.all(
      sides.map(async ({ image, side }) => {
        const resource = pullRequestDiffImageResource(target, image, side);
        const url = await refreshAssetUrl(target.environmentId, resource, controller.signal).catch(
          () => null,
        );
        return { rowId: image.rowId, side, url };
      }),
    ).then((resolved) => {
      if (controller.signal.aborted) return;
      const uris: ImageUris = {};
      for (const { rowId, side, url } of resolved) {
        if (url !== null) uris[rowId] = { ...uris[rowId], [side]: url };
      }
      setImageUrisJson(JSON.stringify(uris));
    });
    return () => controller.abort();
  }, [images, target]);

  const onPressImage = (
    event: NativeSyntheticEvent<{ readonly fileId?: string; readonly side?: "old" | "new" }>,
  ) => {
    const { fileId, side } = event.nativeEvent;
    if (fileId === undefined || side === undefined) return;
    setPreview(pullRequestDiffImageGallery(target, images, { fileId, side }));
  };

  return {
    images,
    imageUrisJson,
    onPressImage,
    preview,
    closePreview: () => setPreview(null),
  };
}
