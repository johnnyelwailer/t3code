import type { ChangeRequestFileAssetResource } from "@t3tools/contracts";
import { diffImageMimeType } from "@t3tools/shared/diffImage";
import * as Effect from "effect/Effect";

import * as PullRequestService from "../pullRequest/PullRequestService.ts";

const CHANGE_REQUEST_FILE_MAX_BYTES = 20 * 1024 * 1024;

export function changeRequestFilePath(resource: ChangeRequestFileAssetResource): string {
  return resource.side === "old" ? resource.oldPath : resource.newPath;
}

/** Null when the file is not an image, that side does not exist, or the host refuses the read. */
export const readChangeRequestFileAsset = Effect.fn("AssetAccess.readChangeRequestFileAsset")(
  function* (resource: ChangeRequestFileAssetResource) {
    const mimeType = diffImageMimeType(changeRequestFilePath(resource));
    if (mimeType === null) return null;
    const pullRequests = yield* PullRequestService.PullRequestService;
    const { _tag: _, ...input } = resource;
    const bytes = yield* pullRequests
      .withRoutingCredential(
        input,
        pullRequests.diffFileBytes({ ...input, maxBytes: CHANGE_REQUEST_FILE_MAX_BYTES }),
      )
      .pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to read a change request file.", {
            number: resource.number,
            side: resource.side,
            reason: cause._tag,
          }),
        ),
        Effect.orElseSucceed(() => null),
      );
    return bytes === null ? null : { bytes, mimeType };
  },
);
