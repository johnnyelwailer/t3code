import { describe, expect, it } from "vitest";
import { buildProjectAvatarProxyUrl } from "./t3work-ProjectAvatar";

describe("buildProjectAvatarProxyUrl", () => {
  it("rewrites Jira project avatars to the authenticated asset content route", () => {
    const resolved = buildProjectAvatarProxyUrl({
      raw: {
        siteUrl: "https://nexwork.atlassian.net",
      },
      iconUrl:
        "https://nexwork.atlassian.net/rest/api/3/universal_avatar/view/type/project/avatar/10577",
    });

    expect(resolved).toBeTypeOf("string");

    const url = new URL(resolved!, "http://localhost");
    expect(url.pathname).toBe("/api/t3work/atlassian/asset/content");
    expect(url.searchParams.get("accountId")).toBe("https://nexwork.atlassian.net");
    expect(url.searchParams.get("url")).toBe(
      "https://nexwork.atlassian.net/rest/api/3/universal_avatar/view/type/project/avatar/10577",
    );
  });

  it("derives the Atlassian cloud id from OAuth-style site urls", () => {
    const resolved = buildProjectAvatarProxyUrl({
      raw: {
        siteUrl: "https://api.atlassian.com/ex/jira/cloud-123",
      },
      iconUrl:
        "https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/universal_avatar/view/type/project/avatar/11727",
    });

    const url = new URL(resolved!, "http://localhost");
    expect(url.searchParams.get("accountId")).toBe("cloud-123");
    expect(url.searchParams.get("url")).toBe(
      "https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/universal_avatar/view/type/project/avatar/11727",
    );
  });

  it("leaves unrelated image urls alone", () => {
    expect(
      buildProjectAvatarProxyUrl({
        raw: {
          siteUrl: "https://nexwork.atlassian.net",
        },
        iconUrl: "https://example.com/logo.png",
      }),
    ).toBeUndefined();
  });
});
