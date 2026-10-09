import { describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi, LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { waitForLinkedRepositoryReady } from "~/t3team/hooks/t3team-waitForLinkedRepositoryReady";

const URL = "https://github.com/example/main";

const backendReturning = (...states: Array<Partial<LinkedRepositorySyncResult>>) => {
  const read = vi.fn();
  for (const state of states) {
    read.mockResolvedValueOnce({
      linkedRepositories: [{ url: URL, localPath: "/tmp/main", status: "pending", ...state }],
    });
  }
  return {
    read,
    backend: { projectWorkspace: { readLinkedRepositoryStatus: read } } as unknown as BackendApi,
  };
};

describe("waitForLinkedRepositoryReady", () => {
  it("waits through queued and cloning polls until the checkout is usable", async () => {
    const { backend, read } = backendReturning(
      { syncState: "queued" },
      { syncState: "cloning" },
      { status: "cloned" },
    );
    await waitForLinkedRepositoryReady({
      backend,
      workspaceRoot: "/tmp/project",
      url: URL,
      sleep: async () => {},
    });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("rejects with the sync error when the clone fails", async () => {
    const { backend } = backendReturning(
      { syncState: "cloning" },
      {
        status: "failed",
        error: "Repository not found",
      },
    );
    await expect(
      waitForLinkedRepositoryReady({
        backend,
        workspaceRoot: "/tmp/project",
        url: URL,
        sleep: async () => {},
      }),
    ).rejects.toThrow("Repository not found");
  });
});
