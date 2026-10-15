import { describe, expect, it, vi } from "vite-plus/test";

import {
  DEV_NEXI_PROVIDER_ENDPOINT,
  resolveNexiDistributionConfig,
} from "./t3team-nexiDistributionConfig";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

describe("resolveNexiDistributionConfig", () => {
  it("falls back to the pack's gateway and no broker for an unconfigured build", () => {
    expect(resolveNexiDistributionConfig({})).toEqual({
      packId: "nexplore-global",
      provider: { endpoint: DEV_NEXI_PROVIDER_ENDPOINT, endpointIsDevDefault: true },
      broker: { url: null },
    });
  });

  it("uses the distribution-supplied endpoint and broker", () => {
    const config = resolveNexiDistributionConfig({
      distribution: {
        providerEndpoint: " https://gateway.example.test/v1 ",
        brokerUrl: "https://broker.example.test",
      },
    });

    expect(config.provider).toEqual({
      endpoint: "https://gateway.example.test/v1",
      endpointIsDevDefault: false,
    });
    expect(config.broker.url).toBe("https://broker.example.test/");
  });

  it("rejects insecure URLs instead of shipping them", () => {
    const config = resolveNexiDistributionConfig({
      distribution: { providerEndpoint: "http://gateway.test", brokerUrl: "http://broker.test" },
    });

    expect(config.provider.endpointIsDevDefault).toBe(true);
    expect(config.broker.url).toBeNull();
  });
});
