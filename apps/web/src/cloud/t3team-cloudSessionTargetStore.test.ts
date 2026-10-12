import { beforeEach, describe, expect, it } from "vitest";

import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";
import {
  clearCloudSessionQueuedSend,
  clearCloudSessionTarget,
  failCloudSessionBind,
  getCloudSessionTarget,
  requestCloudSessionBind,
  resolveCloudSessionCreating,
  selectCloudSessionCreating,
  selectCloudSessionTarget,
} from "./t3team-cloudSessionTargetStore";

describe("cloudSessionTargetStore", () => {
  beforeEach(() => {
    clearCloudSessionTarget("draft-1");
  });

  it("selects a creating sentinel immediately, then resolves to the real session", () => {
    selectCloudSessionCreating("draft-1", "New cloud session");
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: CLOUD_SESSION_CREATING_ID,
      label: "New cloud session",
      bindRequested: false,
    });
    resolveCloudSessionCreating("draft-1", "session-9", "nexi-machine-qa · 7:00 PM");
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      label: "nexi-machine-qa · 7:00 PM",
    });
  });

  it("queues a bind and restores the draft payload on cancel", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "Cloud session",
    });
    const queued = {
      messageId: "msg-1",
      messageText: "ship it",
      createdAt: "2026-10-12T00:00:00.000Z",
    };
    expect(requestCloudSessionBind("draft-1", queued)).toBe(true);
    expect(getCloudSessionTarget("draft-1")?.bindRequested).toBe(true);
    expect(clearCloudSessionQueuedSend("draft-1")).toEqual(queued);
    expect(getCloudSessionTarget("draft-1")?.queuedSend).toBeNull();
    expect(getCloudSessionTarget("draft-1")?.bindRequested).toBe(false);
  });

  it("returns the queued payload on bind failure", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "session-9",
      label: "Cloud session",
    });
    requestCloudSessionBind("draft-1", {
      messageId: "msg-1",
      messageText: "hello",
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    expect(failCloudSessionBind("draft-1", "relay denied")).toMatchObject({
      messageText: "hello",
    });
    expect(getCloudSessionTarget("draft-1")?.failureMessage).toBe("relay denied");
  });
});
