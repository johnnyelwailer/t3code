import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { WorkItemLinks } from "./t3team-WorkItemLinks";

const NOOP_BACKEND = {
  createIssueLink: async () => undefined,
  deleteIssueLink: async () => undefined,
  listIssueLinkTypes: async () => [],
} as unknown as AtlassianBackendApi;

describe("WorkItemLinks", () => {
  it("renders nothing when there are no linked issues", () => {
    const markup = renderToStaticMarkup(
      <WorkItemLinks snapshotRaw={undefined} projectTickets={[]} projectId="EXT-1" />,
    );
    expect(markup).toBe("");
  });

  it("renders a group per link type label with the relation on each row", () => {
    const raw = {
      fields: {
        issuelinks: [
          {
            type: { inward: "is blocked by" },
            inwardIssue: { key: "T3T-1" },
          },
          {
            type: { outward: "blocks" },
            outwardIssue: { key: "T3T-2" },
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      <WorkItemLinks snapshotRaw={raw} projectTickets={[]} projectId="EXT-1" />,
    );

    expect(markup).toContain("is blocked by");
    expect(markup).toContain("blocks");
    expect(markup).toContain("T3T-1");
    expect(markup).toContain("T3T-2");
  });

  it("shows an 'Add link' action once a backend is connected, even with no links yet", () => {
    const markup = renderToStaticMarkup(
      <WorkItemLinks
        snapshotRaw={undefined}
        projectTickets={[]}
        projectId="EXT-1"
        backend={NOOP_BACKEND}
        accountId="acc-1"
        issueIdOrKey="T3T-1"
        onReload={() => {}}
      />,
    );
    expect(markup).toContain("Add link");
  });
});
