import { assert, describe, it } from "@effect/vitest";
import type { AccountDefinition } from "@t3team/pack-api";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vite-plus/test";

import { setPackAccounts } from "../account/t3team-packAccounts.ts";
import { resolveNexiBrokerConfig } from "./t3team-NexiBrokerConfig.ts";

const account = (id: string, resources: Record<string, string>): AccountDefinition => ({
  id,
  label: id,
  issuer: {
    clientId: "c",
    authorizationEndpoint: "https://id.example.test/authorize",
    tokenEndpoint: "https://id.example.test/token",
  },
  baseScopes: "openid",
  resources,
  signInResource: Object.keys(resources)[0]!,
});

const resolve = (env: Record<string, string>) =>
  resolveNexiBrokerConfig().pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
  );
const URL_ENV = { T3CODE_NEXI_BROKER_URL: "https://broker.test/" };

describe("resolveNexiBrokerConfig", () => {
  afterEach(() => setPackAccounts([]));

  it.effect("uses the one account that offers a broker resource", () =>
    Effect.gen(function* () {
      setPackAccounts([account("acme", { broker: "s" }), account("other", { knowledge: "k" })]);
      const config = yield* resolve(URL_ENV);
      assert.deepEqual(Option.getOrNull(config), { url: "https://broker.test", account: "acme" });
    }),
  );

  it.effect("is off without an account to authenticate with, even with a URL", () =>
    Effect.gen(function* () {
      setPackAccounts([account("other", { knowledge: "k" })]);
      assert.isTrue(Option.isNone(yield* resolve(URL_ENV)));
    }),
  );

  it.effect("needs the account named when several offer a broker resource", () =>
    Effect.gen(function* () {
      setPackAccounts([account("a", { broker: "s" }), account("b", { broker: "s" })]);
      assert.isTrue(Option.isNone(yield* resolve(URL_ENV)));
      const named = yield* resolve({ ...URL_ENV, T3CODE_NEXI_BROKER_ACCOUNT: "b" });
      assert.equal(Option.getOrNull(named)?.account, "b");
    }),
  );

  it.effect("is off without a URL or when switched off", () =>
    Effect.gen(function* () {
      setPackAccounts([account("acme", { broker: "s" })]);
      assert.isTrue(Option.isNone(yield* resolve({})));
      assert.isTrue(Option.isNone(yield* resolve({ ...URL_ENV, NEXI_FF_CLOUD_BROKER: "off" })));
    }),
  );
});
