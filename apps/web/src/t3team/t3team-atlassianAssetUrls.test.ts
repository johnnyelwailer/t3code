import { describe, expect, it } from "vite-plus/test";

import { proxyAtlassianAssetUrl } from "./t3team-atlassianAssetUrls";

describe("proxyAtlassianAssetUrl", () => {
  it("rewrites an absolute http(s) URL through the asset proxy when an accountId is known", () => {
    const proxied = proxyAtlassianAssetUrl({
      url: "https://secure.gravatar.com/avatar/abc123?d=mm",
      accountId: "acct-1",
    });

    expect(proxied).toContain("/api/t3team/atlassian/asset/content?");
    expect(proxied).toContain("accountId=acct-1");
    expect(proxied).toContain(encodeURIComponent("https://secure.gravatar.com/avatar/abc123?d=mm"));
  });

  it("leaves the URL untouched when there is no accountId in scope", () => {
    const url = "https://secure.gravatar.com/avatar/abc123";
    expect(proxyAtlassianAssetUrl({ url, accountId: undefined })).toBe(url);
  });

  it("leaves undefined as undefined", () => {
    expect(proxyAtlassianAssetUrl({ url: undefined, accountId: "acct-1" })).toBeUndefined();
  });

  it("does not double-wrap a URL that is already proxied", () => {
    const alreadyProxied =
      "/api/t3team/atlassian/asset/content?accountId=acct-1&url=https%3A%2F%2Fx";
    expect(proxyAtlassianAssetUrl({ url: alreadyProxied, accountId: "acct-1" })).toBe(
      alreadyProxied,
    );
  });

  it("leaves data: URIs untouched", () => {
    const dataUrl = "data:image/png;base64,abc123";
    expect(proxyAtlassianAssetUrl({ url: dataUrl, accountId: "acct-1" })).toBe(dataUrl);
  });

  it("leaves an unparseable URL untouched", () => {
    const garbage = "not a url";
    expect(proxyAtlassianAssetUrl({ url: garbage, accountId: "acct-1" })).toBe(garbage);
  });
});
