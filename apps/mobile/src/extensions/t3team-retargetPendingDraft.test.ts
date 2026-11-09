import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  result: { complete: true, movedThreadIds: ["new-thread"] as string[] },
}));
const retargetNewTaskDraft = vi.hoisted(() => vi.fn());
const retargetQueuedCreations = vi.hoisted(() => vi.fn());
const followRetargetedThreads = vi.hoisted(() => vi.fn());
vi.mock("../state/use-composer-drafts", () => ({ retargetNewTaskDraft }));
vi.mock("../state/t3team-retargetQueuedCreations", () => ({ retargetQueuedCreations }));
vi.mock("../state/t3team-followRetargetedThreads", () => ({ followRetargetedThreads }));

import { retargetPendingDraft } from "./t3team-retargetPendingDraft";

const real = { environmentId: "cloud-env", projectId: "real-project" };
const firstTurnContext = { label: "Cloud session notice", text: "Clone the project." };
const pending = {
  project: { environmentId: "pending-env", id: "pending-project", title: "Repo" },
  firstTurnContext,
};

beforeEach(() => {
  mocks.calls = [];
  mocks.result = { complete: true, movedThreadIds: ["new-thread"] };
  retargetNewTaskDraft.mockReset().mockImplementation(() => mocks.calls.push("draft"));
  retargetQueuedCreations.mockReset().mockImplementation(async () => {
    mocks.calls.push("queue");
    return mocks.result;
  });
  followRetargetedThreads.mockReset().mockImplementation(async () => {
    mocks.calls.push("follow");
  });
});

describe("retargetPendingDraft", () => {
  it("restamps the same draft key onto the real project, as the picker does", async () => {
    expect(await retargetPendingDraft("draft-1", real)).toEqual({ complete: true });
    expect(retargetNewTaskDraft).toHaveBeenCalledExactlyOnceWith("draft-1", real);
    expect(retargetQueuedCreations).not.toHaveBeenCalled();
  });

  it("moves the queued tasks first, then the open threads and the draft", async () => {
    expect(await retargetPendingDraft("draft-1", real, pending)).toEqual({ complete: true });
    expect(retargetQueuedCreations).toHaveBeenCalledExactlyOnceWith(
      { environmentId: "pending-env", projectId: "pending-project" },
      real,
      firstTurnContext,
    );
    expect(followRetargetedThreads).toHaveBeenCalledExactlyOnceWith("pending-env", "cloud-env", [
      "new-thread",
    ]);
    expect(mocks.calls).toEqual(["queue", "follow", "draft"]);
  });

  it("without pending, restamps synchronously and throws an invalid id to the caller", () => {
    void retargetPendingDraft("draft-1", real);
    expect(retargetNewTaskDraft).toHaveBeenCalledOnce();
    expect(() => retargetPendingDraft("draft-1", { environmentId: "", projectId: "p" })).toThrow();
  });

  it("with pending, reports a failure as incomplete instead of rejecting", async () => {
    retargetQueuedCreations.mockRejectedValueOnce(new Error("disk full"));
    await expect(retargetPendingDraft("draft-1", real, pending)).resolves.toEqual({
      complete: false,
    });
    await expect(
      retargetPendingDraft("draft-1", { environmentId: "", projectId: "p" }, pending),
    ).resolves.toEqual({ complete: false });
    expect(retargetNewTaskDraft).not.toHaveBeenCalled();
  });

  it("leaves the draft on its placeholder when the queue did not fully move, so a retry can", async () => {
    mocks.result = { complete: false, movedThreadIds: [] };
    expect(await retargetPendingDraft("draft-1", real, pending)).toEqual({ complete: false });
    expect(retargetNewTaskDraft).not.toHaveBeenCalled();
  });
});
