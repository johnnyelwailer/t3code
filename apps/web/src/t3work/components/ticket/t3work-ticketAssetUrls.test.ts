import { describe, expect, it } from "vite-plus/test";
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

  it("rewrites Jira description image URLs that use secure attachment paths", () => {
    const resolveAssetUrl = createJiraTicketAssetUrlResolver({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      accountId: "acct-1",
      baseUrl: "https://nexwork.atlassian.net/browse/PROJ-7",
      attachments: [
        {
          id: "34816",
          filename: "image-20260226-084855.png",
          mimeType: "image/png",
          content: "https://nexwork.atlassian.net/rest/api/3/attachment/content/34816",
        },
      ],
    });

    const rewritten = new URL(
      resolveAssetUrl!(
        "https://nexwork.atlassian.net/secure/attachment/34816/image-20260226-084855.png",
      ),
      "http://localhost",
    );

    expect(rewritten.pathname).toBe("/api/t3work/atlassian/asset/content");
    expect(rewritten.searchParams.get("url")).toBe(
      "https://nexwork.atlassian.net/rest/api/3/attachment/content/34816",
    );
  });

  it("can build absolute backend asset URLs for desktop protocol pages", () => {
    const resolveAssetUrl = createJiraTicketAssetUrlResolver({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      accountId: "https://nexwork.atlassian.net",
      httpBaseUrl: "http://127.0.0.1:13773/",
      attachments: [
        {
          id: "47541",
          filename: "image-20260629-163728.png",
          mimeType: "image/png",
          content: "https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/attachment/content/47541",
        },
      ],
    });

    const rewritten = new URL(
      resolveAssetUrl!("https://nexwork.atlassian.net/rest/api/3/attachment/content/47541"),
    );

    expect(rewritten.origin).toBe("http://127.0.0.1:13773");
    expect(rewritten.pathname).toBe("/api/t3work/atlassian/asset/content");
    expect(rewritten.searchParams.get("accountId")).toBe("https://nexwork.atlassian.net");
  });
});
