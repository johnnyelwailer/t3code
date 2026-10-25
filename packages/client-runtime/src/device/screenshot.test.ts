import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { captureDeviceScreenshot } from "./screenshot.ts";
import type { DeviceStreamTarget } from "./stream.ts";

const target = (credentials: boolean): DeviceStreamTarget => ({
  platform: "android",
  deviceId: "emu-1",
  access: {
    httpBase: "http://127.0.0.1:4100/hub",
    wsBase: "ws://127.0.0.1:4100/hub",
    query: { wsTicket: "ticket" },
    credentials,
  },
});

describe("captureDeviceScreenshot credentials", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [true, "include"],
    [false, "same-origin"],
  ])(
    "sends credentials=%s as %s, never omit (Android broker loopback cookie)",
    async (flag, mode) => {
      const fetcher = vi.fn(async () => new Response(new Blob(["png"])));
      vi.stubGlobal("fetch", fetcher);
      await captureDeviceScreenshot(target(flag), new AbortController().signal);
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("/vendor/serve-emu/api/screenshot?device=emu-1"),
        expect.objectContaining({ method: "POST", credentials: mode }),
      );
    },
  );
});
