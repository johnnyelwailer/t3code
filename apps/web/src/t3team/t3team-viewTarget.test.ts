import { describe, expect, it } from "vite-plus/test";

import {
  isT3TeamViewTarget,
  normalizeViewTarget,
  viewSurfaceId,
  viewTargetTitle,
} from "./t3team-viewTarget";

describe("isT3TeamViewTarget", () => {
  it.each([
    [{ kind: "my-work", projectId: "p1" }, true],
    [{ kind: "work-item", projectId: "p1", ticketId: "t-1" }, true],
    [{ kind: "work-item", projectId: "p1", ticketId: "t-1", displayId: "NX-1", title: "T" }, true],
    [{ kind: "my-work", projectId: " " }, false],
    [{ kind: "work-item", projectId: "p1" }, false],
    [{ kind: "work-item", projectId: "p1", ticketId: "t-1", title: 4 }, false],
    [{ kind: "board", projectId: "p1" }, false],
    [null, false],
    [["my-work"], false],
  ])("%j -> %s", (value, expected) => {
    expect(isT3TeamViewTarget(value)).toBe(expected);
  });
});

describe("view target identity and title", () => {
  it("keys a tab by project and ticket, never by its label", () => {
    expect(viewSurfaceId({ kind: "my-work", projectId: "p1" })).toBe("view:my-work:p1");
    expect(
      viewSurfaceId({ kind: "work-item", projectId: "p1", ticketId: "t-1", title: "Anything" }),
    ).toBe("view:work-item:p1:t-1");
  });

  it("titles a work item by key and summary, falling back to its id", () => {
    expect(
      viewTargetTitle({
        kind: "work-item",
        projectId: "p1",
        ticketId: "t-1",
        displayId: "NX-4711",
        title: "Rechnungsfreigabe überarbeiten",
      }),
    ).toBe("NX-4711 Rechnungsfreigabe überarbeiten");
    expect(viewTargetTitle({ kind: "work-item", projectId: "p1", ticketId: "t-1" })).toBe("t-1");
  });

  it("drops empty optional labels and unknown fields when normalizing", () => {
    expect(
      normalizeViewTarget({ kind: "work-item", projectId: "p1", ticketId: "t-1", displayId: "" }),
    ).toEqual({ kind: "work-item", projectId: "p1", ticketId: "t-1" });
  });
});
