import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { addAgentContextToThread } from "~/t3team/t3team-addAgentContextToThread";
import { buildAddToChatAgentContextCapabilities } from "~/t3team/t3team-agentContext";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { retryContextCacheJobs } from "~/t3team/t3team-contextCacheJob";
import { writeContextCache } from "~/t3team/t3team-contextCacheWrite";

vi.mock("~/t3team/t3team-contextCacheWrite", () => ({ writeContextCache: vi.fn() }));

const writeCache = vi.mocked(writeContextCache);
const ENVIRONMENT = { sourceEnvironmentId: null, backend: null };
const WORK_ITEM_TOOL = {
  id: "t3_work_item_get",
  label: "Read work item",
  arguments: { issueKey: "PROJ-9" },
};

function threadRef(threadId: string): ScopedThreadRef {
  return { environmentId: "env-remote" as EnvironmentId, threadId: threadId as ThreadId };
}

function request(overrides: Partial<AddToChatRequest> = {}): AddToChatRequest {
  return {
    projectId: "project-1",
    projectTitle: "Alpha",
    targetLabel: "PROJ-9 Prepare release checklist",
    targetType: "work-item",
    kind: "jira-work-item",
    dedupeKey: "project-1:PROJ-9:work-item",
    payload: { description: "full body that must never ride the message" },
    ...overrides,
  };
}

function queued(threadId: string) {
  return useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId[threadId] ?? [];
}

describe("addAgentContextToThread", () => {
  it("queues a pending pointer at once, with the tool reference and no body", () => {
    const start = addAgentContextToThread({
      capabilities: buildAddToChatAgentContextCapabilities(request(), { tools: [WORK_ITEM_TOOL] }),
      threadRef: threadRef("thread-pointer"),
    });

    const [attachment] = queued("thread-pointer");
    expect(start).toBeTypeOf("function");
    expect(writeCache).not.toHaveBeenCalled();
    expect(attachment).toMatchObject({ kind: "jira-work-item", syncStatus: "syncing" });
    expect(attachment?.contextText).toContain('{"issueKey":"PROJ-9"}');
    expect(attachment?.contextText).toContain("t3_work_item_get");
    expect(attachment?.contextText).toContain("not written yet");
    expect(attachment?.contextText).not.toContain("full body");
    expect(attachment?.syncedAt).toBeDefined();
  });

  it("points at the cached copy once the write lands", async () => {
    writeCache.mockResolvedValueOnce(".nexi/context/threads/thread-ready/item.json");
    const start = addAgentContextToThread({
      capabilities: buildAddToChatAgentContextCapabilities(request(), { tools: [WORK_ITEM_TOOL] }),
      threadRef: threadRef("thread-ready"),
    });

    start!(ENVIRONMENT);
    await vi.waitFor(() => expect(queued("thread-ready")[0]?.syncStatus).toBe("synced"));

    expect(queued("thread-ready")[0]?.contextText).toContain(
      "Cached copy: .nexi/context/threads/thread-ready/item.json",
    );
  });

  it("keeps the item usable when the write fails, and retries on mount", async () => {
    writeCache.mockRejectedValueOnce(new Error("environment not connected"));
    const start = addAgentContextToThread({
      capabilities: buildAddToChatAgentContextCapabilities(request()),
      threadRef: threadRef("thread-retry"),
    });

    start!(ENVIRONMENT);
    await vi.waitFor(() => expect(queued("thread-retry")[0]?.syncStatus).toBe("error"));
    expect(queued("thread-retry")[0]?.contextText).toContain(
      "unavailable (environment not connected)",
    );

    writeCache.mockResolvedValueOnce(".nexi/context/threads/thread-retry/item.json");
    retryContextCacheJobs("thread-retry", ENVIRONMENT);
    await vi.waitFor(() => expect(queued("thread-retry")[0]?.syncStatus).toBe("synced"));
  });

  it("adds nothing for a record without an add-to-chat action", () => {
    const start = addAgentContextToThread({
      capabilities: { actions: [] },
      threadRef: threadRef("thread-none"),
    });

    expect(start).toBeNull();
    expect(queued("thread-none")).toEqual([]);
  });
});
