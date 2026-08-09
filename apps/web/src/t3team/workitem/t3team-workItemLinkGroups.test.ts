import { describe, expect, it } from "vite-plus/test";

import { groupWorkItemIssueLinks } from "./t3team-workItemLinkGroups";

function issueLink(input: {
  inwardLabel?: string;
  inwardKey?: string;
  outwardLabel?: string;
  outwardKey?: string;
}) {
  return {
    type: { inward: input.inwardLabel, outward: input.outwardLabel },
    ...(input.inwardKey ? { inwardIssue: { key: input.inwardKey } } : {}),
    ...(input.outwardKey ? { outwardIssue: { key: input.outwardKey } } : {}),
  };
}

describe("groupWorkItemIssueLinks", () => {
  it("returns nothing when the issue has no issuelinks", () => {
    expect(groupWorkItemIssueLinks({ fields: {} }, () => undefined)).toEqual([]);
    expect(groupWorkItemIssueLinks(undefined, () => undefined)).toEqual([]);
  });

  it("groups by the link type's own label, preserving Jira's wording and link order", () => {
    const raw = {
      fields: {
        issuelinks: [
          issueLink({ inwardLabel: "is blocked by", inwardKey: "T3T-1" }),
          issueLink({ outwardLabel: "blocks", outwardKey: "T3T-2" }),
          issueLink({ inwardLabel: "relates to", inwardKey: "T3T-3" }),
        ],
      },
    };

    const groups = groupWorkItemIssueLinks(raw, () => undefined);

    expect(groups.map((group) => group.label)).toEqual(["is blocked by", "blocks", "relates to"]);
    expect(groups[0]?.issues).toEqual([{ key: "T3T-1" }]);
  });

  it("resolves a linked key to a ticket via the caller's finder", () => {
    const raw = {
      fields: { issuelinks: [issueLink({ inwardLabel: "blocks", inwardKey: "T3T-9" })] },
    };
    const ticket = { id: "T3T-9" } as never;

    const groups = groupWorkItemIssueLinks(raw, (key) => (key === "T3T-9" ? ticket : undefined));

    expect(groups[0]?.issues[0]?.ticket).toBe(ticket);
  });

  it("dedupes the same key under the same label", () => {
    const raw = {
      fields: {
        issuelinks: [
          issueLink({ inwardLabel: "blocks", inwardKey: "T3T-1" }),
          issueLink({ inwardLabel: "blocks", inwardKey: "T3T-1" }),
        ],
      },
    };

    const groups = groupWorkItemIssueLinks(raw, () => undefined);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.issues).toHaveLength(1);
  });

  it("groups both the inward and outward side of a single link independently", () => {
    const raw = {
      fields: {
        issuelinks: [
          issueLink({
            inwardLabel: "is blocked by",
            inwardKey: "T3T-1",
            outwardLabel: "blocks",
            outwardKey: "T3T-2",
          }),
        ],
      },
    };

    const groups = groupWorkItemIssueLinks(raw, () => undefined);
    expect(groups).toHaveLength(2);
  });

  it("carries the link id, type name and this issue's direction for delete/undo", () => {
    const raw = {
      fields: {
        issuelinks: [
          {
            id: "10050",
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            outwardIssue: { key: "T3T-2" },
          },
        ],
      },
    };

    const groups = groupWorkItemIssueLinks(raw, () => undefined);

    expect(groups[0]?.issues[0]).toEqual({
      key: "T3T-2",
      linkId: "10050",
      linkTypeName: "Blocks",
      direction: "outward",
    });
  });

  it("omits linkId/linkTypeName/direction when the raw link carries no id or type name", () => {
    const raw = {
      fields: { issuelinks: [issueLink({ inwardLabel: "relates to", inwardKey: "T3T-3" })] },
    };

    const groups = groupWorkItemIssueLinks(raw, () => undefined);

    expect(groups[0]?.issues).toEqual([{ key: "T3T-3" }]);
  });
});
