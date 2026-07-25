import type { BackendApi } from "~/t3team/backend/t3team-types";
import type {
  T3TeamDirectoryBundleFile,
  T3TeamDirectoryBundlePayload,
} from "~/t3team/t3team-contextDirectoryBundle";

export type PersistDirectoryBundleProgress = {
  readonly completedCount: number;
  readonly totalCount: number;
  readonly activeIndex?: number;
  readonly file: T3TeamDirectoryBundleFile;
};

export async function persistDirectoryBundleToWorkspace(input: {
  backend: BackendApi;
  workspaceRoot: string;
  payload: T3TeamDirectoryBundlePayload;
  onProgress?: ((update: PersistDirectoryBundleProgress) => void) | undefined;
}): Promise<ReadonlyArray<string>> {
  const writtenFiles: string[] = [];
  const totalCount = input.payload.files.length;

  for (const [index, file] of input.payload.files.entries()) {
    await input.backend.projectWorkspace.writeContextFiles({
      workspaceRoot: input.workspaceRoot,
      files: [
        {
          relativePath: file.relativePath,
          contents: file.contents,
          ...(file.encoding ? { encoding: file.encoding } : {}),
        },
      ],
    });
    writtenFiles.push(file.relativePath);
    input.onProgress?.({
      completedCount: index + 1,
      totalCount,
      ...(index + 1 < totalCount ? { activeIndex: index + 1 } : {}),
      file,
    });
  }

  return writtenFiles;
}
