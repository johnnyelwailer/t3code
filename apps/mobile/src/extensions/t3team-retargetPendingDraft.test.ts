import { describe, expect, it, vi } from "vite-plus/test";

const retargetNewTaskDraft = vi.hoisted(() => vi.fn());
vi.mock("../state/use-composer-drafts", () => ({ retargetNewTaskDraft }));

import { retargetPendingDraft } from "./t3team-retargetPendingDraft";

describe("retargetPendingDraft", () => {
  it("restamps the same draft key onto the real project, as the picker does", () => {
    retargetPendingDraft("draft-1", { environmentId: "cloud-env", projectId: "real-project" });
    expect(retargetNewTaskDraft).toHaveBeenCalledExactlyOnceWith("draft-1", {
      environmentId: "cloud-env",
      projectId: "real-project",
    });
  });
});
