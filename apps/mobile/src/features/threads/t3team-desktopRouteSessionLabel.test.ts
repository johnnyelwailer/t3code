import { describe, expect, it } from "vite-plus/test";

import { desktopRouteSessionLabel } from "./t3team-desktopRouteSessionLabel";

describe("desktopRouteSessionLabel", () => {
  it("names a broker cloud session like the web card: name (#id)", () => {
    expect(
      desktopRouteSessionLabel({
        _tag: "BrokerConnectionTarget",
        label: "acme-api",
        sessionId: "4242",
      }),
    ).toBe("acme-api (#4242)");
  });

  it("is null for a thread on any other environment: nothing to route there", () => {
    expect(
      desktopRouteSessionLabel({ _tag: "RelayConnectionTarget", label: "My desktop" }),
    ).toBeNull();
    expect(desktopRouteSessionLabel(undefined)).toBeNull();
  });
});
