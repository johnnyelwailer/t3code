import { describe, expect, it, vi } from "vite-plus/test";

import { shouldAttachAssetBearer } from "./t3team-atlassianAssetBearer.ts";

vi.mock("electron", () => ({ session: {} }));

const ASSET = "http://127.0.0.1:3773/api/t3team/atlassian/asset/content?accountId=a&url=x";
const BASE = {
  requestUrl: ASSET,
  pageUrl: "t3code://app/project/1",
  applicationUrl: "t3code://app/",
  backendUrl: "http://127.0.0.1:3773/",
};

describe("shouldAttachAssetBearer", () => {
  it("attaches the bearer to the app renderer's media proxy request to its own backend", () => {
    expect(shouldAttachAssetBearer(BASE)).toBe(true);
  });

  it("gives nothing to a page that is not the app, even on another custom scheme", () => {
    expect(shouldAttachAssetBearer({ ...BASE, pageUrl: "https://evil.example/" })).toBe(false);
    expect(shouldAttachAssetBearer({ ...BASE, pageUrl: "other://app/" })).toBe(false);
    expect(shouldAttachAssetBearer({ ...BASE, pageUrl: undefined })).toBe(false);
  });

  it("sends it to no other server and no other route", () => {
    expect(
      shouldAttachAssetBearer({
        ...BASE,
        requestUrl: "http://192.168.1.5:3773/api/t3team/atlassian/asset/content?url=x",
      }),
    ).toBe(false);
    expect(
      shouldAttachAssetBearer({ ...BASE, requestUrl: "http://127.0.0.1:3773/api/t3team/other" }),
    ).toBe(false);
    expect(shouldAttachAssetBearer({ ...BASE, backendUrl: null })).toBe(false);
  });
});
