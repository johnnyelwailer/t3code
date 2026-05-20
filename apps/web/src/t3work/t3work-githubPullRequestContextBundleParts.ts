import type {
  GitHubPullRequestContextFile,
  GitHubPullRequestFileSnapshot,
} from "~/t3work/backend/t3work-githubTypes";
import type { T3WorkDirectoryBundleFile } from "~/t3work/t3work-contextDirectoryBundle";
import { renderFileSummary } from "~/t3work/t3work-githubPullRequestContextRender";

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
  files: ReadonlyArray<T3WorkDirectoryBundleFile>;
  snapshotIndex: ReadonlyArray<Record<string, unknown>>;
} {
  const files: T3WorkDirectoryBundleFile[] = [];
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
  files: ReadonlyArray<T3WorkDirectoryBundleFile>;
  patchPathByFilename: ReadonlyMap<string, string>;
} {
  const files: T3WorkDirectoryBundleFile[] = [];
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
