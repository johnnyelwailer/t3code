import { describe, expect, it, vi } from "vite-plus/test";
import fc from "fast-check";
import { isNexiDistribution, nexiFeatureFlagPreset, resolveNexiConfig } from "./t3team-nexiConfig";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));
const env = {
  T3CODE_NEXI_BROKER_URL: "https://broker.test/",
  T3CODE_NEXI_ACCOUNT_DEVICE_ENDPOINT: "https://entra.test/device",
  T3CODE_NEXI_ACCOUNT_TOKEN_ENDPOINT: "https://entra.test/token",
  T3CODE_NEXI_BROKER_APP: "public-app",
  T3CODE_NEXI_BROKER_TENANT: "tenant",
};
describe("mobile Nexi public config", () => {
  it("reads both the fork consumer and distribution overlay's flat env contract", () => {
    expect(resolveNexiConfig({ nexi: { env } })).toEqual({
      brokerUrl: "https://broker.test",
      deviceEndpoint: "https://entra.test/device",
      tokenEndpoint: "https://entra.test/token",
      app: "public-app",
      tenant: "tenant",
    });
    expect(resolveNexiConfig({})).toBeNull();
  });
  it.each([
    "T3CODE_NEXI_BROKER_URL",
    "T3CODE_NEXI_ACCOUNT_DEVICE_ENDPOINT",
    "T3CODE_NEXI_ACCOUNT_TOKEN_ENDPOINT",
  ])("rejects unsafe URLs in %s", (key) => {
    for (const value of ["http://entra.test", "https://user:password@entra.test", "not-a-url"]) {
      expect(resolveNexiConfig({ nexi: { env: { ...env, [key]: value } } })).toBeNull();
    }
  });
  it("fails closed for arbitrary untrusted endpoint values", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        if (typeof value === "string") {
          try {
            const url = new URL(value);
            if (url.protocol === "https:" && !url.username && !url.password) return;
          } catch {
            /* Invalid URL. */
          }
        }
        expect(
          resolveNexiConfig({
            nexi: { env: { ...env, T3CODE_NEXI_ACCOUNT_TOKEN_ENDPOINT: value } },
          }),
        ).toBeNull();
      }),
    );
  });
  it("recognises the distribution only when extra.nexi is present", () => {
    expect(isNexiDistribution({ nexi: { env } })).toBe(true);
    expect(isNexiDistribution({})).toBe(false);
    expect(isNexiDistribution(undefined)).toBe(false);
  });
  it("keeps only boolean feature flag defaults from the profile", () => {
    expect(
      nexiFeatureFlagPreset({
        nexi: { featureFlags: { NEXI_MOBILE_BROKER: true, OTHER: "yes", OFF: false } },
      }),
    ).toEqual({ NEXI_MOBILE_BROKER: true, OFF: false });
    expect(nexiFeatureFlagPreset({ nexi: { featureFlags: ["NEXI_MOBILE_BROKER"] } })).toEqual({});
    expect(nexiFeatureFlagPreset({})).toEqual({});
  });
});
