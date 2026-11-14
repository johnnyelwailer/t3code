import { describe, expect, it } from "vite-plus/test";

import { brandUpstreamProductName } from "./t3team-brandUpstreamProductName";

describe("brandUpstreamProductName", () => {
  it("replaces the upstream product name in diagnosis headlines, and leaves T3 Connect alone", () => {
    expect(
      brandUpstreamProductName("T3 Code on office-pc did not accept this device", "Nexi Work"),
    ).toBe("Nexi Work on office-pc did not accept this device");
    expect(brandUpstreamProductName("Update T3 Code on office-pc.", "Nexi Work")).toBe(
      "Update Nexi Work on office-pc.",
    );
    expect(
      brandUpstreamProductName("T3 Connect did not accept this device's sign-in", "Nexi Work"),
    ).toBe("T3 Connect did not accept this device's sign-in");
    expect(brandUpstreamProductName("T3 Code on host did not accept this device", "T3 Code")).toBe(
      "T3 Code on host did not accept this device",
    );
    expect(brandUpstreamProductName("T3 Code on host did not answer", "")).toBe(
      "T3 Code on host did not answer",
    );
  });
});
