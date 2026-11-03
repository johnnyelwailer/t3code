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

  it("says a thread on any other environment is not a cloud session", () => {
    expect(desktopRouteSessionLabel({ _tag: "RelayConnectionTarget", label: "My desktop" })).toBe(
      "My desktop (not a cloud session)",
    );
    expect(desktopRouteSessionLabel(undefined)).toBe("Unknown environment (not a cloud session)");
  });
});
