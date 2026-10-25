import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { clearLoopbackPorts, registerLoopbackPort } from "./t3team-nexiLoopbackFetch";
import {
  authorizeNativeFetch,
  installNativeFetchAuthorization,
} from "./t3team-nexiNativeFetchAuth";

describe("authorizing native HTTP clients over the broker loopback", () => {
  const allow = vi.fn<(url: string) => boolean>(() => true);
  beforeEach(() => {
    allow.mockClear();
    allow.mockReturnValue(true);
    clearLoopbackPorts();
    registerLoopbackPort(4100);
    installNativeFetchAuthorization(allow);
  });

  it("registers the exact URL of a live tunnel with the native module", () => {
    const url = "http://127.0.0.1:4100/api/assets/tok/My%20file.pdf?x=1";
    expect(authorizeNativeFetch(url)).toBe(true);
    expect(allow).toHaveBeenCalledExactlyOnceWith(url);
  });

  it.each([
    ["another loopback port", "http://127.0.0.1:4101/a"],
    ["a remote host", "https://host.example/api/assets/t/a"],
    ["localhost by name", "http://localhost:4100/a"],
    ["a file URI", "file:///cache/a.pdf"],
    ["garbage", "not a url"],
  ])("never offers %s to the native module", (_name, url) => {
    expect(authorizeNativeFetch(url)).toBe(false);
    expect(allow).not.toHaveBeenCalled();
  });

  it("reports false, without throwing, when the module refuses or is unavailable", () => {
    allow.mockReturnValueOnce(false);
    expect(authorizeNativeFetch("http://127.0.0.1:4100/a")).toBe(false);
    allow.mockImplementationOnce(() => {
      throw new Error("Nexi broker requires the Android release build.");
    });
    expect(authorizeNativeFetch("http://127.0.0.1:4100/a")).toBe(false);
  });

  it("does nothing before the broker is installed", () => {
    installNativeFetchAuthorization(null);
    expect(authorizeNativeFetch("http://127.0.0.1:4100/a")).toBe(false);
  });
});
