import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  clearLoopbackPorts,
  registerLoopbackPort,
  withLoopbackCookies,
} from "./t3team-nexiLoopbackFetch";

describe("loopback cookie fetch", () => {
  const base = vi.fn<typeof fetch>(async () => new Response("ok"));
  const fetcher = withLoopbackCookies(base);
  beforeEach(() => {
    base.mockClear();
    clearLoopbackPorts();
    registerLoopbackPort(4100);
  });

  it("keeps the cookie jar for a live tunnel port when the caller says omit", async () => {
    await fetcher("http://127.0.0.1:4100/api/upload", { method: "POST", credentials: "omit" });
    expect(base).toHaveBeenCalledWith("http://127.0.0.1:4100/api/upload", {
      method: "POST",
      credentials: "same-origin",
    });
    await fetcher(new URL("http://127.0.0.1:4100/x"), { credentials: "omit" });
    await fetcher(new Request("http://127.0.0.1:4100/y"), { credentials: "omit" });
    expect(base.mock.calls.map(([, init]) => init?.credentials)).toEqual([
      "same-origin",
      "same-origin",
      "same-origin",
    ]);
  });

  it.each([
    ["another loopback port", "http://127.0.0.1:4101/x"],
    ["a different host", "https://example.com/x"],
    ["localhost by name", "http://localhost:4100/x"],
    ["a malformed URL", "not a url"],
  ])("leaves omit alone for %s", async (_name, url) => {
    await fetcher(url, { credentials: "omit" });
    expect(base).toHaveBeenCalledWith(url, { credentials: "omit" });
  });

  it("passes through include, same-origin and calls without init untouched", async () => {
    await fetcher("http://127.0.0.1:4100/a", { credentials: "include" });
    await fetcher("http://127.0.0.1:4100/b");
    expect(base.mock.calls.map(([, init]) => init)).toEqual([
      { credentials: "include" },
      undefined,
    ]);
  });

  it("forgets a port once its tunnels are closed", async () => {
    clearLoopbackPorts();
    await fetcher("http://127.0.0.1:4100/x", { credentials: "omit" });
    expect(base).toHaveBeenCalledWith("http://127.0.0.1:4100/x", { credentials: "omit" });
  });
});
