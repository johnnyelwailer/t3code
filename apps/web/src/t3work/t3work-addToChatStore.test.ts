import { beforeEach, describe, expect, it } from "vitest";

import {
  buildContextAttachment,
  buildPendingContextAttachment,
  type AddToChatRequest,
} from "~/t3work/t3work-addToChatUtils";
import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import {
  registerContextAttachmentRequest,
  resolveContextAttachmentRequest,
} from "~/t3work/t3work-contextAttachmentSync";

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
  useT3WorkAddToChatStore.setState({
    pendingByProjectId: {},
    pendingByKickoffKey: {},
    threadAttachmentsByThreadId: {},
  });
});

describe("useT3WorkAddToChatStore", () => {
  it("dedupes thread attachments by dedupe key even when attachment ids differ", () => {
    const request = createRequest();
    const firstAttachment = buildPendingContextAttachment({ request, id: "att-1" });
    const duplicateAttachment = buildPendingContextAttachment({ request, id: "att-2" });

    useT3WorkAddToChatStore.getState().enqueueThreadAttachment("thread-1", firstAttachment);
    useT3WorkAddToChatStore.getState().enqueueThreadAttachment("thread-1", duplicateAttachment);

    expect(useT3WorkAddToChatStore.getState().threadAttachmentsByThreadId["thread-1"]).toEqual([
      firstAttachment,
    ]);
  });

  it("replaces thread attachments and clears sync sources when removed", () => {
    const request = createRequest();
    const pendingAttachment = buildPendingContextAttachment({ request, id: "att-1" });
    registerContextAttachmentRequest(pendingAttachment.id, request);

    useT3WorkAddToChatStore.getState().enqueueThreadAttachment("thread-1", pendingAttachment);

    const syncedAttachment = buildContextAttachment({
      id: pendingAttachment.id,
      request,
      payload: { kind: "jira-work-item" },
      syncStatus: "synced",
      syncedAt: "2026-05-18T12:34:56.000Z",
    });
    useT3WorkAddToChatStore
      .getState()
      .replaceThreadAttachment("thread-1", pendingAttachment.id, syncedAttachment);

    expect(useT3WorkAddToChatStore.getState().threadAttachmentsByThreadId["thread-1"]).toEqual([
      syncedAttachment,
    ]);

    useT3WorkAddToChatStore.getState().removeThreadAttachment("thread-1", pendingAttachment.id);

    expect(useT3WorkAddToChatStore.getState().threadAttachmentsByThreadId["thread-1"]).toBe(
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

    useT3WorkAddToChatStore.getState().enqueue({
      projectId: "project-alpha",
      attachment: pendingAttachment,
      createdAt: "2026-05-18T12:00:00.000Z",
    });
    useT3WorkAddToChatStore.getState().enqueueKickoff({
      projectId: "project-alpha",
      ticketId: "ticket-1",
      attachment: pendingAttachment,
      createdAt: "2026-05-18T12:00:00.000Z",
    });

    expect(
      useT3WorkAddToChatStore
        .getState()
        .replaceProjectAttachment("project-alpha", pendingAttachment.id, syncedAttachment),
    ).toBe(true);
    expect(
      useT3WorkAddToChatStore
        .getState()
        .replaceKickoffAttachment(
          "project-alpha",
          "ticket-1",
          pendingAttachment.id,
          syncedAttachment,
        ),
    ).toBe(true);

    expect(useT3WorkAddToChatStore.getState().pendingByProjectId["project-alpha"]).toEqual([
      {
        projectId: "project-alpha",
        attachment: syncedAttachment,
        createdAt: "2026-05-18T12:00:00.000Z",
      },
    ]);
    expect(
      useT3WorkAddToChatStore.getState().pendingByKickoffKey["project-alpha:ticket-1"],
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
