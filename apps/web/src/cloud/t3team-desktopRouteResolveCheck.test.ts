import { describe, expect, it, vi } from "vite-plus/test";

const request = vi.hoisted(() => vi.fn());
vi.mock("~/account/t3team-credentialRequest", () => ({ credentialRequest: request }));

import { desktopRouteTargetResolves } from "./t3team-desktopRouteResolveCheck";

describe("desktopRouteTargetResolves", () => {
  it("asks this computer's route service about the exact host", async () => {
    request.mockResolvedValueOnce({ resolves: false });
    expect(await desktopRouteTargetResolves("npm.nexpore.ch:443")).toBe(false);
    expect(request).toHaveBeenLastCalledWith(
      "GET",
      "/api/t3team/host-services/nexplore-global.desktop-route/resolve/npm.nexpore.ch%3A443",
      expect.objectContaining({ fallbackReason: "host_service_failed" }),
    );
    request.mockResolvedValueOnce({ resolves: true, private: true });
    expect(await desktopRouteTargetResolves("npm.nexplore.ch")).toBe(true);
  });

  it("says nothing when the service can't answer", async () => {
    request.mockRejectedValueOnce(new Error("Unknown desktop route operation."));
    expect(await desktopRouteTargetResolves("npm.nexplore.ch")).toBeNull();
    request.mockResolvedValueOnce({});
    expect(await desktopRouteTargetResolves("npm.nexplore.ch")).toBeNull();
  });
});
