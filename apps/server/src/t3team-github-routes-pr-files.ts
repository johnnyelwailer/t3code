import * as Effect from "effect/Effect";
import type { PullRequestDiffFileContentsInput, PullRequestRef } from "@t3tools/contracts";

import type { PullRequestService } from "./pullRequest/PullRequestService.ts";
import type {
  GitHubPullRequestContextFile,
  GitHubPullRequestFileSnapshot,
  GitHubPullRequestFileVersionSnapshot,
} from "./t3team-github-routes-pr-types.ts";
import { readTrimmedString } from "./t3team-github-routes-shared.ts";

/**
 * Upstream has no "read this file at this ref" primitive — a change request's before/after file
 * bodies come from `PullRequestService.diffFileContents`, keyed by the same change-type/old-path/
 * new-path triple `diffFileContentsInput` already needs. This replaces what used to be a raw
 * GitHub Contents API read per file per side.
 */
function toChangeType(
  file: GitHubPullRequestContextFile,
): PullRequestDiffFileContentsInput["changeType"] {
  if (file.status === "added") return "new";
  if (file.status === "removed") return "deleted";
  if (file.status === "renamed") return file.patch ? "rename-changed" : "rename-pure";
  return "change";
}

function toSnapshot(
  side: "base" | "head",
  path: string,
  contents: string,
): GitHubPullRequestFileVersionSnapshot {
  return { path, ref: side, encoding: "utf8", contents };
}

export function fetchFileSnapshots(input: {
  readonly pullRequests: PullRequestService["Service"];
  readonly ref: PullRequestRef;
  readonly files: ReadonlyArray<GitHubPullRequestContextFile>;
}): Effect.Effect<ReadonlyArray<GitHubPullRequestFileSnapshot>, never, never> {
  return Effect.forEach(
    input.files,
    (file) => {
      const path = readTrimmedString(file.filename);
      if (!path) {
        return Effect.succeed({
          path: "unknown",
          ...(file.status ? { status: file.status } : {}),
        } satisfies GitHubPullRequestFileSnapshot);
      }

      const changeType = toChangeType(file);
      const previousPath = readTrimmedString(file.previous_filename);
      const oldPath = previousPath ?? path;

      return input.pullRequests
        .diffFileContents({ ...input.ref, changeType, oldPath, newPath: path })
        .pipe(
          Effect.map((result) => {
            const snapshot: GitHubPullRequestFileSnapshot = { path };
            if (file.status) Object.assign(snapshot, { status: file.status });
            if (previousPath) Object.assign(snapshot, { previousPath });
            if (changeType !== "new") {
              Object.assign(snapshot, { base: toSnapshot("base", oldPath, result.oldContents) });
            }
            if (changeType !== "deleted") {
              Object.assign(snapshot, { head: toSnapshot("head", path, result.newContents) });
            }
            return snapshot;
          }),
          Effect.orElseSucceed(
            () =>
              ({
                path,
                ...(file.status ? { status: file.status } : {}),
                ...(previousPath ? { previousPath } : {}),
              }) satisfies GitHubPullRequestFileSnapshot,
          ),
        );
    },
    { concurrency: 4 },
  );
}
