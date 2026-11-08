import { describe, expect, it } from "vite-plus/test";

import { openPendingDraft } from "./t3team-openPendingDraft";

const project = { environmentId: "cloud-env", id: "cloud-project", title: "Cloud session" };

describe("openPendingDraft", () => {
  it("loads drafts, creates the draft, lets the caller register it, then opens it", async () => {
    const calls: string[] = [];
    const key = await openPendingDraft(
      {
        waitForDrafts: async () => void calls.push("wait"),
        createDraft: () => (calls.push("create"), "draft-1"),
        openDraft: (draftKey) => void calls.push(`open:${draftKey}`),
      },
      project,
      (draftKey) => void calls.push(`created:${draftKey}`),
    );
    expect(key).toBe("draft-1");
    expect(calls).toEqual(["wait", "create", "created:draft-1", "open:draft-1"]);
  });

  it("opens without a registration callback", async () => {
    const opened: string[] = [];
    await openPendingDraft(
      {
        waitForDrafts: async () => {},
        createDraft: () => "draft-2",
        openDraft: (draftKey) => void opened.push(draftKey),
      },
      project,
    );
    expect(opened).toEqual(["draft-2"]);
  });
});
