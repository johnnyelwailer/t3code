import { describe, expect, it } from "vite-plus/test";

import {
  resolveWorkItemPriorityTone,
  resolveWorkItemStatusTone,
} from "./t3team-workItemFieldTokens";

describe("resolveWorkItemPriorityTone", () => {
  it("matches bare priority names", () => {
    expect(resolveWorkItemPriorityTone("High")).toBe("high");
    expect(resolveWorkItemPriorityTone("lowest")).toBe("lowest");
  });

  /**
   * Real sites decorate the name — Jira's own defaults are "1 - Critical", "2 - Major". Matching the
   * whole string left those with no tone at all, which is how a live issue showed a priority with no
   * icon and no colour.
   */
  it("matches names that carry numbering or separators", () => {
    expect(resolveWorkItemPriorityTone("2 - Major")).toBe("high");
    expect(resolveWorkItemPriorityTone("1 - Critical")).toBe("highest");
    expect(resolveWorkItemPriorityTone("3 - Minor")).toBe("low");
    expect(resolveWorkItemPriorityTone("P1")).toBe("high");
  });

  it("does not match a word that merely contains an alias", () => {
    expect(resolveWorkItemPriorityTone("Lowlands")).toBeUndefined();
    expect(resolveWorkItemPriorityTone("")).toBeUndefined();
    expect(resolveWorkItemPriorityTone(undefined)).toBeUndefined();
  });
});

describe("resolveWorkItemStatusTone", () => {
  it("prefers the status category, which is stable across sites", () => {
    expect(resolveWorkItemStatusTone({ statusCategoryKey: "done", statusName: "Anything" })).toBe(
      "done",
    );
    expect(
      resolveWorkItemStatusTone({ statusCategoryKey: "indeterminate", statusName: "Anything" }),
    ).toBe("inProgress");
  });

  it("falls back to the status name when the category is missing", () => {
    expect(resolveWorkItemStatusTone({ statusName: "Resolved" })).toBe("done");
    expect(resolveWorkItemStatusTone({ statusName: "In Review" })).toBe("inProgress");
    expect(resolveWorkItemStatusTone({ statusName: "Backlog" })).toBe("todo");
  });
});
