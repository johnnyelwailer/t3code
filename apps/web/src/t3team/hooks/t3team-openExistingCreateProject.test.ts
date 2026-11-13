import { describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_MISSING_MESSAGE,
  decideOpenExisting,
  isProjectKnown,
} from "./t3team-openExistingCreateProject";

describe("decideOpenExisting", () => {
  it("does nothing when no already-added project is in play", () => {
    expect(decideOpenExisting({ existingProjectId: null, projectKnown: true })).toEqual({
      action: "idle",
    });
  });

  it("opens a project the app still has", () => {
    expect(decideOpenExisting({ existingProjectId: "app-ex-one", projectKnown: true })).toEqual({
      action: "open",
      projectId: "app-ex-one",
    });
  });

  it("returns a plain error when the workspace is gone, and never asks to navigate", () => {
    expect(decideOpenExisting({ existingProjectId: "app-gone", projectKnown: false })).toEqual({
      action: "error",
      message: WORKSPACE_MISSING_MESSAGE,
    });
  });
});

describe("isProjectKnown", () => {
  it("is true only when the id is in the live project list", () => {
    const projects = [{ id: "app-ex-one" }];
    expect(isProjectKnown("app-ex-one", projects)).toBe(true);
    expect(isProjectKnown("app-gone", projects)).toBe(false);
  });
});
