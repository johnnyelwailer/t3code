import { describe, expect, it } from "vite-plus/test";
import { withNexiMobileConfig } from "./t3team-nexi-app-config.ts";

describe("Nexi mobile branding", () => {
  it("preserves T3 Code identity when no broker env is seeded", () => {
    const base = {
      name: "T3 Code",
      slug: "t3-code",
      scheme: "t3code",
      android: { package: "com.t3tools.t3code" },
    };
    expect(withNexiMobileConfig(base, {})).toBe(base);
  });
  it("brands a Nexi build and isolates it from upstream OTA while preserving Clerk and relay", () => {
    const next = withNexiMobileConfig(
      {
        name: "T3 Code",
        slug: "t3-code",
        extra: {
          clerk: { publishableKey: "pk_test", jwtTemplate: "relay" },
          relay: { url: "https://relay.test" },
        },
        plugins: [
          ["expo-font", { fonts: ["base.ttf"] }],
          ["expo-splash-screen", {}],
        ],
      },
      {
        T3CODE_NEXI_BROKER_URL: "https://broker.test",
        T3CODE_NEXI_PROVIDER_ENDPOINT: "https://provider.test",
      },
    );
    expect(next).toMatchObject({
      name: "Nexi Work",
      scheme: "nexiwork",
      updates: { enabled: false },
      android: { package: "com.nexplore.nexiwork" },
      extra: {
        clerk: { publishableKey: "pk_test" },
        relay: { url: "https://relay.test" },
        nexi: { env: { T3CODE_NEXI_PROVIDER_ENDPOINT: "https://provider.test" } },
      },
    });
    expect(next.plugins![0]).toEqual([
      "expo-font",
      { fonts: ["base.ttf", "./assets/t3team-buenos-aires-vf.ttf"] },
    ]);
    expect(next.android?.adaptiveIcon?.foregroundImage).toBe(
      "./assets/t3team-nexplore-adaptive-mark.png",
    );
    expect(next.plugins![1]).toMatchObject([
      "expo-splash-screen",
      { android: { image: "./assets/t3team-nexplore-adaptive-mark.png" } },
    ]);
    expect(next.plugins).toContainEqual([
      "./plugins/t3team-withNexiBrokerOrigin.cjs",
      { origin: "https://broker.test" },
    ]);
  });
});
