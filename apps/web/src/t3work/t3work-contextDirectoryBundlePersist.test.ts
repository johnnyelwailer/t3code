import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import { persistDirectoryBundleToWorkspace } from "~/t3work/t3work-contextDirectoryBundlePersist";
import type { T3WorkDirectoryBundlePayload } from "~/t3work/t3work-contextDirectoryBundle";

const writeContextFiles = vi.fn();

function createBackend(): BackendApi {
  return {
    projectWorkspace: {
      discoverRecipes: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        hasProjectLocalRecipes: false,
        recipes: [],
      })),
      writeContextFiles,
    },
  } as unknown as BackendApi;
}

const payload: T3WorkDirectoryBundlePayload = {
  kind: "t3work-directory-bundle",
  dedupeKey: "project-alpha:PROJ-7:work-item",
  bundleRootRelativePath: ".t3work/context/jira/project-alpha/items/proj-7",
  files: [
    {
      relativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
      contents: '{"availability":"full"}',
    },
    {
      relativePath: ".t3work/context/jira/project-alpha/items/proj-7/manifest.json",
      contents: '{"kind":"jira-work-item-context-manifest"}',
    },
  ],
  fileReferences: [],
  lightweightItem: { kind: "jira-work-item", label: "PROJ-7" },
};

beforeEach(() => {
  writeContextFiles.mockReset();
  writeContextFiles.mockResolvedValue({
    workspaceRoot: "/tmp/project-alpha",
    writtenFiles: [],
  });
});

describe("persistDirectoryBundleToWorkspace", () => {
  it("writes each bundle file through the shared workspace route", async () => {
    const written = await persistDirectoryBundleToWorkspace({
      backend: createBackend(),
      workspaceRoot: "/tmp/project-alpha",
      payload,
    });

    expect(writeContextFiles).toHaveBeenCalledTimes(2);
    expect(written).toEqual(payload.files.map((file) => file.relativePath));
  });
});
