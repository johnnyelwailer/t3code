import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("expo-file-system", () => ({
  Directory: class {
    create() {}
  },
  File: class {
    exists = false;
    parentDirectory = null;
    create() {}
    moveSync() {}
    async text() {
      return "";
    }
    write() {}
  },
  Paths: { document: "/documents" },
}));

import { readDraftModelSelection, setDraftModelSelection } from "./t3team-draftModel";

it("stores a model on a draft by plain ids and reads it back", () => {
  expect(readDraftModelSelection("draft:seam")).toBeNull();
  setDraftModelSelection("draft:seam", { instanceId: "claudeAgent", model: "claude-sonnet-5-5" });
  expect(readDraftModelSelection("draft:seam")).toEqual({
    instanceId: "claudeAgent",
    model: "claude-sonnet-5-5",
  });
});
