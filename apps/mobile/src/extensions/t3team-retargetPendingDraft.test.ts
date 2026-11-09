import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const retargetNewTaskDraft = vi.hoisted(() => vi.fn());
const retargetQueuedCreations = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../state/use-composer-drafts", () => ({ retargetNewTaskDraft }));
vi.mock("../state/t3team-retargetQueuedCreations", () => ({ retargetQueuedCreations }));

import { retargetPendingDraft } from "./t3team-retargetPendingDraft";

const real = { environmentId: "cloud-env", projectId: "real-project" };

beforeEach(() => {
  retargetNewTaskDraft.mockClear();
  retargetQueuedCreations.mockClear();
});

describe("retargetPendingDraft", () => {
  it("restamps the same draft key onto the real project, as the picker does", async () => {
    await retargetPendingDraft("draft-1", real);
    expect(retargetNewTaskDraft).toHaveBeenCalledExactlyOnceWith("draft-1", real);
    expect(retargetQueuedCreations).not.toHaveBeenCalled();
  });

  it("moves the task queued on the placeholder, with the first-turn context", async () => {
    const firstTurnContext = { label: "Cloud session notice", text: "Clone the project." };
    await retargetPendingDraft("draft-1", real, {
      project: { environmentId: "pending-env", id: "pending-project", title: "Repo" },
      firstTurnContext,
    });
    expect(retargetNewTaskDraft).toHaveBeenCalledExactlyOnceWith("draft-1", real);
    expect(retargetQueuedCreations).toHaveBeenCalledExactlyOnceWith(
      { environmentId: "pending-env", projectId: "pending-project" },
      real,
      firstTurnContext,
    );
  });
});
