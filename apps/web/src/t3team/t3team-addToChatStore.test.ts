import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  buildContextAttachment,
  buildPendingContextAttachment,
  type AddToChatRequest,
} from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import {
  registerContextAttachmentRequest,
  resolveContextAttachmentRequest,
} from "~/t3team/t3team-contextAttachmentSync";

function createRequest(): AddToChatRequest {
  return {
    projectId: "project-alpha",
    projectTitle: "Project Alpha",
    projectWorkspaceRoot: "/tmp/project-alpha",
    targetLabel: "PROJ-7 Investigate context sync",
    targetType: "work-item",
    kind: "jira-work-item",
    dedupeKey: "project-alpha:PROJ-7:work-item",
    summaryItems: [{ label: "Status", value: "In Progress" }],
    payload: { ok: true },
  };
}

beforeEach(() => {
  useT3TeamAddToChatStore.setState({
    pendingByProjectId: {},
    pendingByKickoffKey: {},
    threadAttachmentsByThreadId: {},
  });
});

describe("useT3TeamAddToChatStore", () => {
  it("dedupes thread attachments by dedupe key even when attachment ids differ", () => {
    const request = createRequest();
    const firstAttachment = buildPendingContextAttachment({ request, id: "att-1" });
    const duplicateAttachment = buildPendingContextAttachment({ request, id: "att-2" });

    useT3TeamAddToChatStore.getState().enqueueThreadAttachment("thread-1", firstAttachment);
    useT3TeamAddToChatStore.getState().enqueueThreadAttachment("thread-1", duplicateAttachment);

    expect(useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId["thread-1"]).toEqual([
      firstAttachment,
    ]);
  });

  it("replaces thread attachments and clears sync sources when removed", () => {
    const request = createRequest();
    const pendingAttachment = buildPendingContextAttachment({ request, id: "att-1" });
    registerContextAttachmentRequest(pendingAttachment.id, request);

    useT3TeamAddToChatStore.getState().enqueueThreadAttachment("thread-1", pendingAttachment);

    const syncedAttachment = buildContextAttachment({
      id: pendingAttachment.id,
      request,
      payload: { kind: "jira-work-item" },
      syncStatus: "synced",
      syncedAt: "2026-05-18T12:34:56.000Z",
    });
    useT3TeamAddToChatStore
      .getState()
      .replaceThreadAttachment("thread-1", pendingAttachment.id, syncedAttachment);

    expect(useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId["thread-1"]).toEqual([
      syncedAttachment,
    ]);

    useT3TeamAddToChatStore.getState().removeThreadAttachment("thread-1", pendingAttachment.id);

    expect(useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId["thread-1"]).toBe(
      undefined,
    );
    expect(resolveContextAttachmentRequest(pendingAttachment.id)).toBeUndefined();
  });

  it("replaces queued project and kickoff attachments by id", () => {
    const request = createRequest();
    const pendingAttachment = buildPendingContextAttachment({ request, id: "att-2" });
    const syncedAttachment = buildContextAttachment({
      id: pendingAttachment.id,
      request,
      payload: { kind: "jira-work-item" },
      syncStatus: "synced",
      syncedAt: "2026-05-18T12:34:56.000Z",
    });

    useT3TeamAddToChatStore.getState().enqueue({
      projectId: "project-alpha",
      attachment: pendingAttachment,
      createdAt: "2026-05-18T12:00:00.000Z",
    });
    useT3TeamAddToChatStore.getState().enqueueKickoff({
      projectId: "project-alpha",
      ticketId: "ticket-1",
      attachment: pendingAttachment,
      createdAt: "2026-05-18T12:00:00.000Z",
    });

    expect(
      useT3TeamAddToChatStore
        .getState()
        .replaceProjectAttachment("project-alpha", pendingAttachment.id, syncedAttachment),
    ).toBe(true);
    expect(
      useT3TeamAddToChatStore
        .getState()
        .replaceKickoffAttachment(
          "project-alpha",
          "ticket-1",
          pendingAttachment.id,
          syncedAttachment,
        ),
    ).toBe(true);

    expect(useT3TeamAddToChatStore.getState().pendingByProjectId["project-alpha"]).toEqual([
      {
        projectId: "project-alpha",
        attachment: syncedAttachment,
        createdAt: "2026-05-18T12:00:00.000Z",
      },
    ]);
    expect(
      useT3TeamAddToChatStore.getState().pendingByKickoffKey["project-alpha:ticket-1"],
    ).toEqual([
      {
        projectId: "project-alpha",
        ticketId: "ticket-1",
        attachment: syncedAttachment,
        createdAt: "2026-05-18T12:00:00.000Z",
      },
    ]);
  });
});
