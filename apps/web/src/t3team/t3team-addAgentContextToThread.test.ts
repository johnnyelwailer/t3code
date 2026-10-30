import { describe, expect, it } from "vite-plus/test";

import { addAgentContextToThread } from "~/t3team/t3team-addAgentContextToThread";
import { buildAddToChatAgentContextCapabilities } from "~/t3team/t3team-agentContext";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { resolveContextAttachmentRequest } from "~/t3team/t3team-contextAttachmentSync";

const WORK_ITEM_TOOL = {
  id: "t3_work_item_get",
  label: "Read work item",
  arguments: { issueKey: "PROJ-9" },
};

function request(overrides: Partial<AddToChatRequest> = {}): AddToChatRequest {
  return {
    projectId: "project-1",
    projectTitle: "Alpha",
    targetLabel: "PROJ-9 Prepare release checklist",
    targetType: "work-item",
    kind: "jira-work-item",
    dedupeKey: "project-1:PROJ-9:work-item",
    payload: { description: "frozen at drop time" },
    ...overrides,
  };
}

function queuedFor(threadId: string) {
  return useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId[threadId] ?? [];
}

describe("addAgentContextToThread", () => {
  it("queues a reference, not a snapshot, for an item that exposes a fetch tool", () => {
    const added = addAgentContextToThread({
      capabilities: buildAddToChatAgentContextCapabilities(request(), { tools: [WORK_ITEM_TOOL] }),
      threadId: "thread-reference",
      backend: null,
    });

    const [attachment] = queuedFor("thread-reference");
    expect(added).toBe(true);
    expect(attachment).toMatchObject({
      kind: "jira-work-item",
      label: "PROJ-9 Prepare release checklist",
      dedupeKey: "project-1:PROJ-9:work-item",
    });
    expect(attachment?.syncStatus).toBeUndefined();
    expect(attachment?.contextText).toContain("t3_work_item_get");
    expect(attachment?.contextText).toContain('{"issueKey":"PROJ-9"}');
    expect(attachment?.contextText).not.toContain("frozen at drop time");
    // Nothing is synced at send time for a reference: the agent fetches the live record.
    expect(resolveContextAttachmentRequest(attachment!.id)).toBeUndefined();
  });

  it("falls back to the request payload when no tool can fetch the item", () => {
    const added = addAgentContextToThread({
      capabilities: buildAddToChatAgentContextCapabilities(request({ targetType: "github" })),
      threadId: "thread-snapshot",
      backend: null,
    });

    const [attachment] = queuedFor("thread-snapshot");
    expect(added).toBe(true);
    expect(attachment?.syncStatus).toBe("syncing");
    expect(resolveContextAttachmentRequest(attachment!.id)).toBeDefined();
  });

  it("adds nothing for a record without an add-to-chat action", () => {
    const added = addAgentContextToThread({
      capabilities: { actions: [] },
      threadId: "thread-none",
      backend: null,
    });

    expect(added).toBe(false);
    expect(queuedFor("thread-none")).toEqual([]);
  });
});
