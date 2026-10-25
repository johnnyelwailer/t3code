import { Linking } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { tryOpenExternalUrl } from "../lib/openExternalUrl";
import { clearLoopbackPorts, registerLoopbackPort } from "./t3team-nexiLoopbackFetch";
import { isTunnelUrl, shareUnlessPrivate } from "./t3team-nexiNativeFetchAuth";

vi.mock("react-native", () => ({ Linking: { openURL: vi.fn() } }));

const openURL = vi.mocked(Linking.openURL);
const asset = "http://127.0.0.1:4100/api/assets/signed/report.pdf";

describe("tunnel URLs are never handed to another app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLoopbackPorts();
    registerLoopbackPort(4100);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    openURL.mockResolvedValue(undefined as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("refuses to open a live tunnel URL in an external app, for every target", async () => {
    for (const target of ["file-preview", "markdown-link", "html-render", "mcp-app"] as const) {
      await expect(tryOpenExternalUrl(asset, target)).resolves.toBe(false);
    }
    expect(openURL).not.toHaveBeenCalled();
  });

  it("still opens ordinary links, including other loopback addresses", async () => {
    await expect(tryOpenExternalUrl("https://github.com/a/b/pull/1", "pull-request")).resolves.toBe(
      true,
    );
    await expect(tryOpenExternalUrl("http://127.0.0.1:4999/x", "markdown-link")).resolves.toBe(
      true,
    );
    expect(openURL).toHaveBeenCalledTimes(2);
  });

  it("does not share a tunnel URL, and shares anything else", () => {
    const share = vi.fn();
    expect(shareUnlessPrivate(asset, share)).toBe(false);
    expect(share).not.toHaveBeenCalled();
    expect(shareUnlessPrivate("https://example.com/x", share)).toBe(true);
    expect(share).toHaveBeenCalledExactlyOnceWith("https://example.com/x");
  });

  it("recognises a tunnel URL only for a registered port on 127.0.0.1", () => {
    expect(isTunnelUrl(asset)).toBe(true);
    expect(isTunnelUrl("http://127.0.0.1:4101/a")).toBe(false);
    expect(isTunnelUrl("http://localhost:4100/a")).toBe(false);
    expect(isTunnelUrl("not a url")).toBe(false);
  });
});
