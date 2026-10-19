import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  applyCloudQueuedSendAction,
  CLOUD_QUEUED_SEND_SCRATCH_FAILED_MESSAGE,
  type CloudQueuedSendActionContext,
} from "./t3team-cloudQueuedSendActions";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import * as store from "./t3team-cloudQueuedSendStore";

const cloud = EnvironmentId.make("env-cloud");
const queued = decodeCloudQueuedSend({
  messageId: "msg-scratch",
  messageText: "hi",
  outgoingText: "hi",
  titleSeed: "hi",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "machine",
  createdAt: "2026-10-13T08:00:00.000Z",
})!;

function context(openScratchProject: CloudQueuedSendActionContext["openScratchProject"]) {
  return {
    draftId: "draft-scratch",
    queued,
    threadId: ThreadId.make("thread-scratch"),
    projectCwd: null,
    requests: new Map<string, string>(),
    draftPageOpen: true,
    connect: vi.fn(),
    openScratchProject,
    startTurn: vi.fn(),
  } satisfies CloudQueuedSendActionContext;
}

describe("applyCloudQueuedSendAction open-scratch", () => {
  it("opens the cloud machine's scratch project once, however often the flusher re-runs", () => {
    const open = vi.fn(async () => ({ id: "scratch-cloud" }));
    const ctx = context(open);
    applyCloudQueuedSendAction({ kind: "open-scratch", environmentId: cloud }, ctx);
    applyCloudQueuedSendAction({ kind: "open-scratch", environmentId: cloud }, ctx);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(cloud);
  });

  it("parks the message as retryable when the folder cannot be opened", async () => {
    const fail = vi.spyOn(store, "failDraftCloudQueuedSend").mockImplementation(() => {});
    applyCloudQueuedSendAction(
      { kind: "open-scratch", environmentId: cloud },
      context(async () => null),
    );
    await vi.waitFor(() =>
      expect(fail).toHaveBeenCalledWith(
        "draft-scratch",
        "msg-scratch",
        CLOUD_QUEUED_SEND_SCRATCH_FAILED_MESSAGE,
        true,
      ),
    );
    fail.mockRestore();
  });
});
