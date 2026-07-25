import { describe, expect, it } from "vite-plus/test";

import { buildWorkItemStatusOptions } from "./t3team-workItemStatusOptions";

describe("buildWorkItemStatusOptions", () => {
  it("returns the board's statuses in order", () => {
    const options = buildWorkItemStatusOptions(
      [{ name: "To Do" }, { name: "In Progress" }, { name: "Done" }],
      "To Do",
    );

    expect(options.map((option) => option.name)).toEqual(["To Do", "In Progress", "Done"]);
  });

  it("dedupes case-insensitively, keeping the first occurrence", () => {
    const options = buildWorkItemStatusOptions(
      [{ name: "To Do", id: "1" }, { name: "TO DO", id: "2" }],
      undefined,
    );

    expect(options).toEqual([{ name: "To Do", id: "1" }]);
  });

  it("appends the current status when the board doesn't list it", () => {
    const options = buildWorkItemStatusOptions([{ name: "To Do" }, { name: "Done" }], "In Review");

    expect(options.map((option) => option.name)).toEqual(["To Do", "Done", "In Review"]);
  });

  it("does not duplicate the current status when it's already present", () => {
    const options = buildWorkItemStatusOptions([{ name: "To Do" }, { name: "Done" }], "done");

    expect(options.map((option) => option.name)).toEqual(["To Do", "Done"]);
  });

  it("returns just the current status when the board has none", () => {
    expect(buildWorkItemStatusOptions([], "To Do")).toEqual([{ name: "To Do" }]);
  });

  it("returns an empty list when there is nothing to offer", () => {
    expect(buildWorkItemStatusOptions([], undefined)).toEqual([]);
  });

  it("skips blank status names", () => {
    const options = buildWorkItemStatusOptions([{ name: "   " }, { name: "Done" }], undefined);

    expect(options.map((option) => option.name)).toEqual(["Done"]);
  });
});
