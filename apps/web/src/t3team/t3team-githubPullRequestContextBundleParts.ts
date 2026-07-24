import type {
  GitHubPullRequestContextFile,
  GitHubPullRequestFileSnapshot,
} from "~/t3team/backend/t3team-githubTypes";
import type { T3TeamDirectoryBundleFile } from "~/t3team/t3team-contextDirectoryBundle";
import { renderFileSummary } from "~/t3team/t3team-githubPullRequestContextRender";

function normalizeBundlePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    .join("/");
}

export function buildGitHubPullRequestSnapshotArtifacts(input: {
  root: string;
  fileSnapshots: ReadonlyArray<GitHubPullRequestFileSnapshot>;
}): {
  files: ReadonlyArray<T3TeamDirectoryBundleFile>;
  snapshotIndex: ReadonlyArray<Record<string, unknown>>;
} {
  const files: T3TeamDirectoryBundleFile[] = [];
  const snapshotIndex = input.fileSnapshots.map((snapshot) => {
    const record = { path: snapshot.path } as Record<string, unknown>;
    if (snapshot.status) record.status = snapshot.status;
    if (snapshot.previousPath) record.previousPath = snapshot.previousPath;
    for (const versionKey of ["base", "head"] as const) {
      const version = snapshot[versionKey];
      if (!version) continue;
      const versionRecord = { path: version.path, ref: version.ref } as Record<string, unknown>;
      if (version.error) {
        versionRecord.error = version.error;
      } else if (version.contents !== undefined) {
        const relativePath = `${input.root}/pull-request/snapshots/${versionKey}/${normalizeBundlePath(version.path)}`;
        files.push({
          relativePath,
          contents: version.contents,
          ...(version.encoding === "base64" ? { encoding: "base64" as const } : {}),
          ...(typeof version.sizeBytes === "number" ? { sizeBytes: version.sizeBytes } : {}),
        });
        versionRecord.relativePath = relativePath;
        if (version.encoding) versionRecord.encoding = version.encoding;
        if (typeof version.sizeBytes === "number") versionRecord.sizeBytes = version.sizeBytes;
      }
      record[versionKey] = versionRecord;
    }
    return record;
  });
  return { files, snapshotIndex };
}

export function buildGitHubPullRequestPatchArtifacts(input: {
  root: string;
  files: ReadonlyArray<GitHubPullRequestContextFile>;
}): {
  files: ReadonlyArray<T3TeamDirectoryBundleFile>;
  patchPathByFilename: ReadonlyMap<string, string>;
} {
  const files: T3TeamDirectoryBundleFile[] = [];
  const patchPathByFilename = new Map<string, string>();
  for (const file of input.files) {
    if (!file.filename || !file.patch) continue;
    const patchPath = `${input.root}/pull-request/files/patches/${normalizeBundlePath(file.filename)}.patch.md`;
    patchPathByFilename.set(file.filename, patchPath);
    files.push({
      relativePath: patchPath,
      contents: [renderFileSummary(file), "", "```diff", file.patch, "```"].join("\n"),
    });
  }
  return { files, patchPathByFilename };
}
