import { describe, expect, it, vi } from "vite-plus/test";
import { showsNexiWelcome } from "./t3team-nexiFirstRun";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const nexi = {
  nexi: {
    env: {
      T3CODE_NEXI_BROKER_URL: "https://broker.test",
      T3CODE_NEXI_ACCOUNT_DEVICE_ENDPOINT: "https://entra.test/device",
      T3CODE_NEXI_ACCOUNT_TOKEN_ENDPOINT: "https://entra.test/token",
      T3CODE_NEXI_BROKER_APP: "public-app",
      T3CODE_NEXI_BROKER_TENANT: "tenant",
    },
  },
};
const firstRun = { isLoadingConnections: false, hasConnections: false };

describe("Nexi first run", () => {
  it("leads with Entra sign-in on a fresh Android Nexi Work install", () => {
    expect(showsNexiWelcome(firstRun, "android", nexi)).toBe(true);
  });

  it("keeps upstream's first run for stock builds, iOS, loading and paired devices", () => {
    expect(showsNexiWelcome(firstRun, "android", {})).toBe(false);
    expect(showsNexiWelcome(firstRun, "android", { nexi: {} })).toBe(false);
    expect(showsNexiWelcome(firstRun, "ios", nexi)).toBe(false);
    expect(showsNexiWelcome({ ...firstRun, isLoadingConnections: true }, "android", nexi)).toBe(
      false,
    );
    expect(showsNexiWelcome({ ...firstRun, hasConnections: true }, "android", nexi)).toBe(false);
  });
});
