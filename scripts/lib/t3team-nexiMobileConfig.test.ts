import { describe, expect, it } from "vite-plus/test";
import { resolvePublicConfig } from "./public-config.ts";
import fc from "fast-check";
import { NEXI_MOBILE_ENV_KEYS } from "./t3team-nexiMobileConfig.ts";

describe("Nexi mobile build contract", () => {
  it("never publishes unknown environment keys for arbitrary build environments", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.string()), (env) => {
        const config = resolvePublicConfig(env);
        expect(
          Object.keys(config.nexi).every((key) =>
            (NEXI_MOBILE_ENV_KEYS as readonly string[]).includes(key),
          ),
        ).toBe(true);
        expect(
          Object.values(config.nexi).every((value) => value.length > 0 && value === value.trim()),
        ).toBe(true);
      }),
    );
  });
  it("consumes the allowlisted flat keys with source precedence and no private env", () => {
    const config = resolvePublicConfig(
      {
        T3CODE_NEXI_BROKER_APP: " app ",
        PRIVATE_SECRET: "never",
        T3CODE_RELAY_URL: "https://relay.test",
        T3CODE_CLERK_PUBLISHABLE_KEY: "pk_test",
        T3CODE_CLERK_JWT_TEMPLATE: "relay",
      },
      { T3CODE_NEXI_BROKER_APP: "other", T3CODE_NEXI_BROKER_URL: "https://broker.test" },
    );
    expect(config.nexi).toEqual({
      T3CODE_NEXI_BROKER_APP: "app",
      T3CODE_NEXI_BROKER_URL: "https://broker.test",
    });
    expect(config.relayUrl).toBe("https://relay.test");
    expect(config.clerkPublishableKey).toBe("pk_test");
    expect(config.clerkJwtTemplate).toBe("relay");
  });
});
