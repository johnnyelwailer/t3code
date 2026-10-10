import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { packAccounts } from "../account/t3team-packAccounts.ts";

/**
 * Where the Nexi broker lives and which account (`defineAccount`) authenticates to it (distribution
 * issue #556). The account comes from the distribution; nothing about its identity provider is
 * known here.
 *
 * The broker is on when a URL is configured — the distribution seeds `T3CODE_NEXI_BROKER_URL` into
 * its desktop build — and an account to authenticate with exists, unless `NEXI_FF_CLOUD_BROKER`
 * switches it off, which puts new cloud sessions back on T3 Connect (the one-release fallback).
 * `T3CODE_NEXI_BROKER_ACCOUNT` names the account; it may be left out when the distribution defines
 * exactly one.
 */

const BROKER_URL_ENV = "T3CODE_NEXI_BROKER_URL";
const BROKER_FLAG_ENV = "NEXI_FF_CLOUD_BROKER";
const BROKER_ACCOUNT_ENV = "T3CODE_NEXI_BROKER_ACCOUNT";
/** The resource name the broker asks its account for; the account maps it to a scope. */
export const BROKER_RESOURCE = "broker";

export interface NexiBrokerConfig {
  /** https://… of the broker, without a trailing slash. */
  readonly url: string;
  /** The account whose `broker` resource token authenticates every broker call. */
  readonly account: string;
}

const isSwitchedOff = (raw: Option.Option<string>) =>
  Option.isSome(raw) && ["0", "false", "off"].includes(raw.value.trim().toLowerCase());

/** `None` when no broker is configured, it is switched off, or no account can authenticate to it. */
export const resolveNexiBrokerConfig = Effect.fn("cloud.broker.config")(function* () {
  const url = yield* Effect.option(Config.String(BROKER_URL_ENV));
  const flag = yield* Effect.option(Config.String(BROKER_FLAG_ENV));
  if (Option.isNone(url) || url.value.trim() === "" || isSwitchedOff(flag)) {
    return Option.none<NexiBrokerConfig>();
  }
  const named = yield* Effect.option(Config.String(BROKER_ACCOUNT_ENV));
  const accounts = packAccounts().filter((account) =>
    Object.hasOwn(account.resources, BROKER_RESOURCE),
  );
  const account = Option.isSome(named)
    ? accounts.find((candidate) => candidate.id === named.value.trim())
    : accounts.length === 1
      ? accounts[0]
      : undefined;
  if (account === undefined) {
    yield* Effect.logWarning("Nexi broker configured, but no account offers a broker resource", {
      named: Option.getOrNull(named),
      candidates: accounts.map((candidate) => candidate.id),
    });
    return Option.none<NexiBrokerConfig>();
  }
  return Option.some<NexiBrokerConfig>({
    url: url.value.trim().replace(/\/+$/, ""),
    account: account.id,
  });
});
