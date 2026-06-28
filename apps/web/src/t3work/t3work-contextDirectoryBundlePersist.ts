import type { BackendApi } from "~/t3work/backend/t3work-types";
import type {
  T3WorkDirectoryBundleFile,
  T3WorkDirectoryBundlePayload,
} from "~/t3work/t3work-contextDirectoryBundle";

export type PersistDirectoryBundleProgress = {
  readonly completedCount: number;
  readonly totalCount: number;
  readonly activeIndex?: number;
  readonly file: T3WorkDirectoryBundleFile;
};

export async function persistDirectoryBundleToWorkspace(input: {
  backend: BackendApi;
  workspaceRoot: string;
  payload: T3WorkDirectoryBundlePayload;
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
