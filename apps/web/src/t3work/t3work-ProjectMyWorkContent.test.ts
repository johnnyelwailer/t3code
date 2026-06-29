import { describe, expect, it } from "vite-plus/test";

import { resolveProjectMyWorkContentState } from "./t3work-projectMyWorkContentState";

describe("project my work content", () => {
  it("shows a loading state before the empty state while initial data is hydrating", () => {
    expect(
      resolveProjectMyWorkContentState({
        loading: true,
        assignedWorkItemsCount: 0,
        filteredWorkItemsCount: 0,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("shows the assigned-work empty state once loading finishes", () => {
    expect(
      resolveProjectMyWorkContentState({
        loading: false,
        assignedWorkItemsCount: 0,
        filteredWorkItemsCount: 0,
      }),
    ).toEqual({ kind: "empty", reason: "no-assigned" });
  });

  it("shows the filtered empty state after assigned work has loaded", () => {
    expect(
      resolveProjectMyWorkContentState({
        loading: false,
        assignedWorkItemsCount: 3,
        filteredWorkItemsCount: 0,
      }),
    ).toEqual({ kind: "empty", reason: "filtered" });
  });
});
