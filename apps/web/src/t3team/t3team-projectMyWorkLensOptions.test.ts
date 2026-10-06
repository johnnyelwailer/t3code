import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { filterProjectMyWorkTickets } from "./t3team-projectMyWork";
import { getProjectMyWorkLensOptions, shouldHideDoneWork } from "./t3team-projectMyWorkLensOptions";

const identity = { displayName: "PJ" };
const open = createTicket({ id: "open", assignee: "PJ", status: "In Progress" });
const done = createTicket({ id: "done", assignee: "PJ", status: "Done" });

describe("My work options per lens", () => {
  it("offers the digest only the filters it applies", () => {
    expect(getProjectMyWorkLensOptions("digest")).toEqual({
      viewMode: false,
      grouping: false,
      sort: false,
      kanbanLanes: false,
    });
  });

  it("offers each lens exactly the controls that change what it renders", () => {
    expect(getProjectMyWorkLensOptions("hierarchy")).toMatchObject({ viewMode: true, sort: true });
    expect(getProjectMyWorkLensOptions("hierarchy")).toMatchObject({
      grouping: false,
      kanbanLanes: false,
    });
    expect(getProjectMyWorkLensOptions("board")).toMatchObject({
      grouping: true,
      sort: true,
      kanbanLanes: true,
      viewMode: false,
    });
  });
});

describe("open work by default in the list lens", () => {
  it("hides Done only for the list lens, and only while no status is asked for", () => {
    const base = { statusCategory: "all", selectedStatus: "all" } as const;
    expect(shouldHideDoneWork({ lens: "hierarchy", ...base })).toBe(true);
    expect(shouldHideDoneWork({ lens: "board", ...base })).toBe(false);
    expect(shouldHideDoneWork({ lens: "digest", ...base })).toBe(false);
    expect(
      shouldHideDoneWork({ lens: "hierarchy", statusCategory: "done", selectedStatus: "all" }),
    ).toBe(false);
    expect(
      shouldHideDoneWork({ lens: "hierarchy", statusCategory: "all", selectedStatus: "Done" }),
    ).toBe(false);
  });

  it("drops Done tickets from the filter result when asked, keeps them otherwise", () => {
    const input = {
      tickets: [open, done],
      identity,
      query: "",
      statusCategory: "all",
      selectedPriority: "all",
      selectedStatus: "all",
    } as const;
    expect(filterProjectMyWorkTickets({ ...input, hideDone: true }).map((t) => t.id)).toEqual([
      "open",
    ]);
    // A search looks for a specific ticket, finished or not.
    expect(
      filterProjectMyWorkTickets({ ...input, hideDone: true, query: done.ref.displayId }).map(
        (t) => t.id,
      ),
    ).toEqual(["done"]);
    expect(
      filterProjectMyWorkTickets(input)
        .map((t) => t.id)
        .toSorted(),
    ).toEqual(["done", "open"]);
  });
});
