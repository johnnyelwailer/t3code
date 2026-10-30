import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { postToEnvironment } from "~/t3team/backend/t3team-environmentWorkflowBackend";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { persistContextAttachmentPayload } from "~/t3team/t3team-contextAttachmentSyncPersist";
import { writeContextCache } from "~/t3team/t3team-contextCacheWrite";

vi.mock("~/state/entities", () => ({
  readThreadShell: () => ({ projectId: "remote-project", worktreePath: "/work/remote-thread" }),
  readProject: () => ({ workspaceRoot: "/work/remote-project" }),
}));
vi.mock("~/t3team/backend/t3team-environmentWorkflowBackend", () => ({
  postToEnvironment: vi.fn(async () => ({})),
}));
vi.mock("~/t3team/t3team-contextAttachmentSyncPersist", () => ({
  persistContextAttachmentPayload: vi.fn(async () => ".nexi/context/misc/p/item/entrypoint.json"),
}));

const SOURCE = "env-local" as EnvironmentId;
const REMOTE = "env-remote" as EnvironmentId;
const BACKEND = {} as BackendApi;

function request(overrides: Partial<AddToChatRequest> = {}): AddToChatRequest {
  return {
    projectId: "project-1",
    projectTitle: "Alpha",
    projectWorkspaceRoot: "/local/alpha",
    targetLabel: "PROJ-9 Prepare release checklist",
    targetType: "work-item",
    kind: "jira-work-item",
    dedupeKey: "project-1:PROJ-9:work-item",
    payload: async () => ({
      kind: "t3team-directory-bundle",
      dedupeKey: "project-1:PROJ-9:work-item",
      bundleRootRelativePath: ".nexi/context/PROJ-9",
      files: [],
      fileReferences: [],
    }),
    ...overrides,
  };
}

function threadRef(environmentId: EnvironmentId): ScopedThreadRef {
  return { environmentId, threadId: "thread-1" as ThreadId };
}

describe("writeContextCache", () => {
  it("writes the full record, fetched from the dragged-from environment, through the destination's own server", async () => {
    const path = await writeContextCache({
      request: request({
        fullRecord: async () => ({
          item: { status: "In Progress" },
          comments: [{ body: "ship it" }],
        }),
      }),
      threadRef: threadRef(REMOTE),
      addedAt: "2026-10-30T10:00:00.000Z",
      sourceEnvironmentId: SOURCE,
      backend: BACKEND,
    });

    expect(path).toBe(".nexi/context/threads/thread-1/project-1-proj-9-work-item.json");
    expect(postToEnvironment).toHaveBeenCalledOnce();
    const [environmentId, route, body] = vi.mocked(postToEnvironment).mock.calls[0]!;
    expect(environmentId).toBe(REMOTE);
    expect(route).toBe("/api/t3team/project/workspace/context-files");
    expect(body).toMatchObject({ workspaceRoot: "/work/remote-thread" });
    const [file] = (body as { files: ReadonlyArray<{ contents: string }> }).files;
    expect(JSON.parse(file!.contents)).toMatchObject({
      capturedAt: "2026-10-30T10:00:00.000Z",
      record: { item: { status: "In Progress" }, comments: [{ body: "ship it" }] },
    });
    expect(persistContextAttachmentPayload).not.toHaveBeenCalled();
  });

  it("writes nothing when the read of the full record fails", async () => {
    vi.mocked(postToEnvironment).mockClear();

    await expect(
      writeContextCache({
        request: request({
          fullRecord: async () => {
            throw new Error("Jira is not connected in this environment.");
          },
        }),
        threadRef: threadRef(REMOTE),
        addedAt: "2026-10-30T10:00:00.000Z",
        sourceEnvironmentId: SOURCE,
        backend: BACKEND,
      }),
    ).rejects.toThrow("Jira is not connected");
    expect(postToEnvironment).not.toHaveBeenCalled();
  });

  it("uses the existing context sync when the thread is on the dragged-from environment", async () => {
    vi.mocked(postToEnvironment).mockClear();

    const path = await writeContextCache({
      request: request({ payload: { description: "local" } }),
      threadRef: threadRef(SOURCE),
      addedAt: "2026-10-30T10:00:00.000Z",
      sourceEnvironmentId: SOURCE,
      backend: BACKEND,
    });

    expect(path).toBe(".nexi/context/misc/p/item/entrypoint.json");
    expect(postToEnvironment).not.toHaveBeenCalled();
  });

  it("says so when the full record exists only on the dragged-from machine", async () => {
    await expect(
      writeContextCache({
        request: request(),
        threadRef: threadRef(REMOTE),
        addedAt: "2026-10-30T10:00:00.000Z",
        sourceEnvironmentId: SOURCE,
        backend: BACKEND,
      }),
    ).rejects.toThrow("only exists on the machine it was dragged from");
  });
});
