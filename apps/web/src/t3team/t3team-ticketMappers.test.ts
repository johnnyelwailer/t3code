import { describe, expect, it } from "vite-plus/test";

import { resourceRefToProjectTicket, snapshotToProjectTicket } from "./t3team-ticketMappers";

describe("resourceRefToProjectTicket", () => {
  it("carries labels through from the resource ref", () => {
    const ticket = resourceRefToProjectTicket("project-1", {
      provider: "atlassian",
      kind: "issue",
      id: "TEST-1",
      displayId: "TEST-1",
      title: "Fix the bug",
      url: "https://example.test/browse/TEST-1",
      projectId: "external-1",
      labels: ["backend", "urgent"],
    });

    expect(ticket.labels).toEqual(["backend", "urgent"]);
  });

  it("omits labels when the resource ref has none", () => {
    const ticket = resourceRefToProjectTicket("project-1", {
      provider: "atlassian",
      kind: "issue",
      id: "TEST-2",
      displayId: "TEST-2",
      title: "No labels",
      url: "https://example.test/browse/TEST-2",
      projectId: "external-1",
    });

    expect(ticket.labels).toBeUndefined();
  });

  it("routes issueTypeIconUrl through the asset proxy when an accountId is given", () => {
    const ticket = resourceRefToProjectTicket(
      "project-1",
      {
        provider: "atlassian",
        kind: "issue",
        id: "TEST-5",
        displayId: "TEST-5",
        title: "Typed issue",
        url: "https://example.test/browse/TEST-5",
        projectId: "external-1",
        issueTypeIconUrl: "https://api.atlassian.com/ex/jira/site-1/icon.png",
      },
      "acct-1",
    );

    expect(ticket.issueTypeIconUrl).toContain("/api/t3team/atlassian/asset/content?");
    expect(ticket.ref.issueTypeIconUrl).toBe(ticket.issueTypeIconUrl);
  });

  it("leaves issueTypeIconUrl unproxied without an accountId", () => {
    const ticket = resourceRefToProjectTicket("project-1", {
      provider: "atlassian",
      kind: "issue",
      id: "TEST-6",
      displayId: "TEST-6",
      title: "Typed issue",
      url: "https://example.test/browse/TEST-6",
      projectId: "external-1",
      issueTypeIconUrl: "https://api.atlassian.com/ex/jira/site-1/icon.png",
    });

    expect(ticket.issueTypeIconUrl).toBe("https://api.atlassian.com/ex/jira/site-1/icon.png");
  });
});

describe("snapshotToProjectTicket", () => {
  it("carries labels through from snapshot fields", () => {
    const ticket = snapshotToProjectTicket("project-1", {
      ref: {
        provider: "atlassian",
        kind: "issue",
        id: "TEST-3",
        displayId: "TEST-3",
        title: "Snapshot ticket",
        url: "https://example.test/browse/TEST-3",
        projectId: "external-1",
      },
      fetchedAt: "2026-05-21T00:00:00.000Z",
      fields: {
        labels: ["design", "urgent"],
      },
    });

    expect(ticket.labels).toEqual(["design", "urgent"]);
  });

  it("omits labels when snapshot fields have none", () => {
    const ticket = snapshotToProjectTicket("project-1", {
      ref: {
        provider: "atlassian",
        kind: "issue",
        id: "TEST-4",
        displayId: "TEST-4",
        title: "No labels",
        url: "https://example.test/browse/TEST-4",
        projectId: "external-1",
      },
      fetchedAt: "2026-05-21T00:00:00.000Z",
      fields: {},
    });

    expect(ticket.labels).toBeUndefined();
  });

  it("routes issueTypeIconUrl from snapshot fields through the asset proxy", () => {
    const ticket = snapshotToProjectTicket(
      "project-1",
      {
        ref: {
          provider: "atlassian",
          kind: "issue",
          id: "TEST-7",
          displayId: "TEST-7",
          title: "Snapshot ticket",
          url: "https://example.test/browse/TEST-7",
          projectId: "external-1",
        },
        fetchedAt: "2026-05-21T00:00:00.000Z",
        fields: {
          typeIconUrl: "https://api.atlassian.com/ex/jira/site-1/icon.png",
        },
      },
      "acct-1",
    );

    expect(ticket.issueTypeIconUrl).toContain("/api/t3team/atlassian/asset/content?");
  });
});
