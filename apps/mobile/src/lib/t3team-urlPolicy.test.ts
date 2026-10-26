import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MobileExtensions } from "../extensions/t3team-extensionTypes";

const registry = vi.hoisted(() => ({ current: {} as MobileExtensions }));
vi.mock("../extensions/t3team-extensions", () => ({
  get mobileExtensions() {
    return registry.current;
  },
}));

import {
  APP_PRIVATE_URL_MESSAGE,
  beforeNativeFetch,
  isAppPrivateUrl,
  openAssetLink,
  previewDocumentBaseUrl,
  shareUnlessPrivate,
} from "./t3team-urlPolicy";

const attachment = { name: "report.pdf", mimeType: "application/pdf" };
const PRIVATE = "http://127.0.0.1:4100/asset";

beforeEach(() => {
  registry.current = {};
});

describe("a build without a url policy", () => {
  it("treats every URL as shareable, opens assets normally and leaves documents alone", async () => {
    const share = vi.fn();
    const open = vi.fn();
    expect(isAppPrivateUrl(PRIVATE)).toBe(false);
    expect(shareUnlessPrivate(PRIVATE, share)).toBe(true);
    expect(share).toHaveBeenCalledWith(PRIVATE);
    await openAssetLink({ url: PRIVATE, attachment, open, report: vi.fn() });
    expect(open).toHaveBeenCalledWith(PRIVATE);
    expect(() => beforeNativeFetch(PRIVATE)).not.toThrow();
    expect(
      previewDocumentBaseUrl(
        JSON.stringify({ access: { httpBase: PRIVATE } }),
        "https://localhost/",
      ),
    ).toBe("https://localhost/");
  });
});

describe("a build with a url policy", () => {
  const policy = (extra: Partial<NonNullable<MobileExtensions["urlPolicy"]>> = {}) => {
    registry.current = {
      urlPolicy: { isAppPrivate: (url) => url.startsWith("http://127.0.0.1"), ...extra },
    };
  };

  it("never shares or opens an app-private URL in another app", async () => {
    policy();
    const share = vi.fn();
    const open = vi.fn();
    const report = vi.fn();
    expect(shareUnlessPrivate(PRIVATE, share)).toBe(false);
    expect(share).not.toHaveBeenCalled();
    await openAssetLink({ url: PRIVATE, attachment, open, report });
    expect(open).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(APP_PRIVATE_URL_MESSAGE);
    expect(shareUnlessPrivate("https://example.test/a", share)).toBe(true);
  });

  it("opens an app-private asset through the policy and public ones as before", async () => {
    const openAppPrivate = vi.fn(async () => {});
    policy({ openAppPrivate });
    const open = vi.fn();
    const report = vi.fn();
    await openAssetLink({ url: PRIVATE, attachment, open, report });
    expect(openAppPrivate).toHaveBeenCalledWith({ url: PRIVATE, attachment, report });
    await openAssetLink({ url: "https://example.test/a", attachment, open, report });
    expect(open).toHaveBeenCalledWith("https://example.test/a");
  });

  it("tells the policy before a native fetch and takes its document base URL", () => {
    const seen: string[] = [];
    policy({
      beforeNativeFetch: (url) => seen.push(url),
      documentBaseUrl: (httpBase) => `${new URL(httpBase).origin}/`,
    });
    beforeNativeFetch(PRIVATE);
    expect(seen).toEqual([PRIVATE]);
    expect(
      previewDocumentBaseUrl(
        JSON.stringify({ access: { httpBase: PRIVATE } }),
        "https://localhost/",
      ),
    ).toBe("http://127.0.0.1:4100/");
    expect(previewDocumentBaseUrl("not json", "https://localhost/")).toBe("https://localhost/");
  });

  it("fails closed when the classifier throws, and stays quiet when other hooks throw", async () => {
    policy({
      isAppPrivate: () => {
        throw new Error("boom");
      },
      beforeNativeFetch: () => {
        throw new Error("boom");
      },
    });
    expect(isAppPrivateUrl(PRIVATE)).toBe(true);
    const share = vi.fn();
    expect(shareUnlessPrivate(PRIVATE, share)).toBe(false);
    expect(share).not.toHaveBeenCalled();
    const open = vi.fn();
    const report = vi.fn();
    await openAssetLink({ url: PRIVATE, attachment, open, report });
    expect(open).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(APP_PRIVATE_URL_MESSAGE);
    expect(() => beforeNativeFetch(PRIVATE)).not.toThrow();
  });

  it("reports a generic message, never an external open, when openAppPrivate throws or rejects", async () => {
    for (const openAppPrivate of [
      () => {
        throw new Error("sync boom");
      },
      () => Promise.reject(new Error("async boom")),
    ]) {
      policy({ openAppPrivate });
      const open = vi.fn();
      const report = vi.fn();
      await expect(
        openAssetLink({ url: PRIVATE, attachment, open, report }),
      ).resolves.toBeUndefined();
      expect(open).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledWith(APP_PRIVATE_URL_MESSAGE);
    }
  });
});
