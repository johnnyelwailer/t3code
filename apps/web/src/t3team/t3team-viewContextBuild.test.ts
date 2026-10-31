import { describe, expect, it } from "vite-plus/test";

import { buildViewContext, selectionFromAside } from "./t3team-viewContextBuild";

const view = { surface: "my-work", projectId: "p1", filters: { query: "q" } } as const;

describe("buildViewContext", () => {
  it("builds the context for the reporting project, with the true count past the id cap", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const context = buildViewContext({
      projectId: "p1",
      view,
      items: { projectId: "p1", ids },
      selection: selectionFromAside({ ticketId: "t-9" }, null),
    });
    expect(context).toMatchObject({
      version: 1,
      surface: "my-work",
      selection: { kind: "work-item", id: "t-9" },
      visibleItemCount: 250,
    });
    expect(context?.visibleItemIds).toHaveLength(200);
  });

  it("reports nothing for another project's view, and never another project's items", () => {
    expect(buildViewContext({ projectId: "p2", view, items: null, selection: null })).toBeNull();
    expect(
      buildViewContext({
        projectId: "p1",
        view,
        items: { projectId: "p2", ids: ["x"] },
        selection: null,
      }),
    ).toMatchObject({ visibleItemIds: [], visibleItemCount: 0 });
  });

  it("names a pull request selection with the neutral change-request kind", () => {
    expect(selectionFromAside(null, { repository: "acme/web", number: 7 })).toEqual({
      kind: "change-request",
      id: "acme/web#7",
    });
    expect(selectionFromAside(null, null)).toBeNull();
  });
});
