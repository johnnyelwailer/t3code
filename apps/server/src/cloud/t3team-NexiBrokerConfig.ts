import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

/**
 * Where the Nexi broker lives and which Entra app signs users in to it (distribution issue #556).
 *
 * The broker is on when a URL is configured — the Nexplore distribution seeds
 * `T3CODE_NEXI_BROKER_URL` into the desktop build — unless `NEXI_FF_CLOUD_BROKER` switches it off,
 * which puts new cloud sessions back on T3 Connect (the one-release fallback).
 */

const BROKER_URL_ENV = "T3CODE_NEXI_BROKER_URL";
const BROKER_FLAG_ENV = "NEXI_FF_CLOUD_BROKER";
/** The Nexplore tenant and the `nx-nexi` app: public identifiers, not secrets. */
const DEFAULT_TENANT = "be4f2c2f-7478-413e-9569-aa6278d6f7f1";
const DEFAULT_APP = "9fff57c4-d8ab-4d4c-9267-c5528b7ae345";

export interface NexiBrokerConfig {
  /** https://… of the broker, without a trailing slash. */
  readonly url: string;
  readonly tenant: string;
  readonly app: string;
}

const isSwitchedOff = (raw: Option.Option<string>) =>
  Option.isSome(raw) && ["0", "false", "off"].includes(raw.value.trim().toLowerCase());

/** `None` when no broker is configured or it is switched off; read live, like the other flags. */
export const resolveNexiBrokerConfig = Effect.fn("cloud.broker.config")(function* () {
  const url = yield* Effect.option(Config.String(BROKER_URL_ENV));
  const flag = yield* Effect.option(Config.String(BROKER_FLAG_ENV));
  if (Option.isNone(url) || url.value.trim() === "" || isSwitchedOff(flag)) {
    return Option.none<NexiBrokerConfig>();
  }
  const tenant = yield* Config.String("T3CODE_NEXI_BROKER_TENANT").pipe(
    Config.withDefault(DEFAULT_TENANT),
  );
  const app = yield* Config.String("T3CODE_NEXI_BROKER_APP").pipe(Config.withDefault(DEFAULT_APP));
  return Option.some<NexiBrokerConfig>({ url: url.value.trim().replace(/\/+$/, ""), tenant, app });
});
