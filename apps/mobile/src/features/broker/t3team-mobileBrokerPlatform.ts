import { BROKER_RESOURCE } from "@t3tools/shared/t3team-nexiBrokerClient";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";

import { runtime } from "../../lib/runtime";
import { registerBrokerProxy } from "../../lib/t3team-brokerProxyTransport";
import { accountAccessToken, nexiBroker } from "../account/t3team-accountController";
import { resolveNexiDistributionConfig } from "../distribution/t3team-nexiDistributionConfig";
import { makeMobileBrokerGateway } from "./t3team-mobileBrokerGateway";

/**
 * The connection platform's broker gateway, bound to the app's Microsoft account: the gateway asks
 * the broker as that account, and the transport seam takes its proxy token from the same sign-in.
 */
export const mobileBrokerGateway = Effect.gen(function* () {
  const brokerUrl = resolveNexiDistributionConfig().broker.url;
  registerBrokerProxy(
    brokerUrl === null
      ? null
      : { brokerUrl, token: () => runtime.runPromise(accountAccessToken(BROKER_RESOURCE)) },
  );
  return makeMobileBrokerGateway({
    broker: Effect.promise(nexiBroker),
    http: yield* HttpClient.HttpClient,
  });
});
