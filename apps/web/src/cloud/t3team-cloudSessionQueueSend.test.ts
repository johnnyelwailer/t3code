import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { CloudSession } from "@t3tools/contracts";

import {
  clearCloudSessionTarget,
  selectCloudSessionCreating,
  selectCloudSessionTarget,
} from "./t3team-cloudSessionTargetStore";
import { queueCloudSessionSendIfNeeded } from "./t3team-cloudSessionQueueSend";

describe("queueCloudSessionSendIfNeeded", () => {
  beforeEach(() => {
    clearCloudSessionTarget("draft-1");
  });

  it("queues while the create is still in flight", () => {
    selectCloudSessionCreating("draft-1");
    const queued = queueCloudSessionSendIfNeeded({
      scopeKey: "draft-1",
      messageId: "msg-1",
      messageText: "hello cloud",
      sessions: [],
      availableEnvironmentIds: new Set(),
    });
    expect(queued).toMatchObject({ messageId: "msg-1", messageText: "hello cloud" });
  });

  it("queues a ready session that is not yet project-synced", () => {
    selectCloudSessionTarget({
      scopeKey: "draft-1",
      sessionId: "s-1",
      label: "Cloud session",
    });
    const session = {
      sessionId: "s-1",
      phase: "ready",
      environmentId: "env-cloud",
    } as unknown as CloudSession;
    const queued = queueCloudSessionSendIfNeeded({
      scopeKey: "draft-1",
      messageId: "msg-2",
      messageText: "go",
      sessions: [session],
      availableEnvironmentIds: new Set(),
    });
    expect(queued?.messageText).toBe("go");
  });

  it("does nothing without an optimistic target", () => {
    expect(
      queueCloudSessionSendIfNeeded({
        scopeKey: "draft-1",
        messageId: "msg-1",
        messageText: "x",
        sessions: [],
        availableEnvironmentIds: new Set(),
      }),
    ).toBeNull();
  });
});
