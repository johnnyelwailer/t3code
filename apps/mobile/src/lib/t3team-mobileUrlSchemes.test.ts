import { describe, expect, it } from "vite-plus/test";

import { urlSchemesFromConfig } from "./t3team-mobileUrlSchemes";

describe("urlSchemesFromConfig", () => {
  it("returns an empty list when extra is absent or wrong-typed", () => {
    expect(urlSchemesFromConfig(undefined)).toEqual([]);
    expect(urlSchemesFromConfig(null)).toEqual([]);
    expect(urlSchemesFromConfig("nexi")).toEqual([]);
    expect(urlSchemesFromConfig({ urlSchemes: "nexi" })).toEqual([]);
    expect(urlSchemesFromConfig({ urlSchemes: ["nexi", 7, null, ""] })).toEqual(["nexi"]);
  });

  it("keeps the declared schemes in order and lowercases them", () => {
    expect(urlSchemesFromConfig({ urlSchemes: ["nexi", "Other"] })).toEqual(["nexi", "other"]);
  });

  it("dedupes and drops entries that are not valid URL schemes", () => {
    expect(
      urlSchemesFromConfig({ urlSchemes: ["nexi", "nexi", "1bad", "has/slash", "good"] }),
    ).toEqual(["nexi", "good"]);
  });
});
