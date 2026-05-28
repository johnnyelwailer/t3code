import { describe, expect, it } from "vitest";

import { extractRelationshipKeys } from "~/t3work/t3work-ticketRelationshipKeys";

describe("extractRelationshipKeys", () => {
  it("classifies blocker-style Jira links alongside generic references", () => {
    const relationships = extractRelationshipKeys({
      fields: {
        parent: { key: "IES-100" },
        subtasks: [{ key: "IES-101" }],
        issuelinks: [
          {
            type: {
              outward: "blocks",
              inward: "is blocked by",
            },
            outwardIssue: { key: "IES-102" },
          },
          {
            type: {
              outward: "depends on",
              inward: "is depended on by",
            },
            outwardIssue: { key: "IES-103" },
          },
          {
            type: {
              outward: "relates to",
              inward: "relates to",
            },
            inwardIssue: { key: "IES-104" },
          },
        ],
      },
    });

    expect(relationships).toMatchObject({
      parentKey: "IES-100",
      childKeys: ["IES-101"],
      referenceKeys: ["IES-102", "IES-103", "IES-104"],
      blockedByKeys: ["IES-103"],
      blockingKeys: ["IES-102"],
    });
    expect(relationships.issueLinks).toEqual(
      expect.arrayContaining([
        { key: "IES-102", relation: "blocks", description: "blocks" },
        { key: "IES-103", relation: "blocked-by", description: "depends on" },
        { key: "IES-104", relation: "related", description: "relates to" },
      ]),
    );
  });
});
