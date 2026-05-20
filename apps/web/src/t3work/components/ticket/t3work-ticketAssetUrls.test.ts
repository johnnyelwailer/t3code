import { describe, expect, it } from "vitest";
import { createJiraTicketAssetUrlResolver } from "./t3work-ticketAssetUrls";

describe("createJiraTicketAssetUrlResolver", () => {
  it("rewrites matching Jira attachment URLs to the local-first asset content route", () => {
    const resolveAssetUrl = createJiraTicketAssetUrlResolver({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      accountId: "acct-1",
      workspaceRoot: "/workspace/project-alpha",
      baseUrl: "https://nexwork.atlassian.net/browse/PROJ-7",
      attachments: [
        {
          id: "34816",
          filename: "image-20260226-084855.png",
          mimeType: "image/png",
          content: "https://nexwork.atlassian.net/rest/api/3/attachment/content/34816",
          thumbnail: "/rest/api/3/attachment/thumbnail/34816",
        },
      ],
    });

    expect(resolveAssetUrl).toBeTypeOf("function");

    const fromAbsolute = new URL(
      resolveAssetUrl!("https://nexwork.atlassian.net/rest/api/3/attachment/content/34816"),
      "http://localhost",
    );
    expect(fromAbsolute.pathname).toBe("/api/t3work/atlassian/asset/content");
    expect(fromAbsolute.searchParams.get("accountId")).toBe("acct-1");
    expect(fromAbsolute.searchParams.get("workspaceRoot")).toBe("/workspace/project-alpha");
    expect(fromAbsolute.searchParams.get("url")).toBe(
      "https://nexwork.atlassian.net/rest/api/3/attachment/content/34816",
    );
    expect(fromAbsolute.searchParams.get("relativePath")).toBe(
      ".t3work/context/jira/project-alpha/items/proj-7/attachments/files/34816-image-20260226-084855.png",
    );

    const fromRelativeThumbnail = new URL(
      resolveAssetUrl!("/rest/api/3/attachment/thumbnail/34816"),
      "http://localhost",
    );
    expect(fromRelativeThumbnail.searchParams.get("url")).toBe(
      "https://nexwork.atlassian.net/rest/api/3/attachment/content/34816",
    );
    expect(fromRelativeThumbnail.searchParams.get("relativePath")).toBe(
      ".t3work/context/jira/project-alpha/items/proj-7/attachments/files/34816-image-20260226-084855.png",
    );
  });

  it("leaves unrelated URLs unchanged", () => {
    const resolveAssetUrl = createJiraTicketAssetUrlResolver({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      accountId: "acct-1",
      attachments: [
        {
          id: "34816",
          filename: "image-20260226-084855.png",
          mimeType: "image/png",
          content: "https://nexwork.atlassian.net/rest/api/3/attachment/content/34816",
        },
      ],
    });

    expect(resolveAssetUrl!("https://example.com/image.png")).toBe("https://example.com/image.png");
  });
});
