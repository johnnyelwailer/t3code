import { exchangeCode, listAccessibleResources } from "@t3tools/integrations-atlassian";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { T3TeamAtlassianError, tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import { persistAtlassianOAuthAccounts } from "./t3team-atlassian-oauth-accountPersist.ts";
import {
  consumePendingAtlassianOAuthFlow,
  markAtlassianOAuthFlowCompleted,
  putPendingAtlassianOAuthFlow,
} from "./t3team-atlassian-oauth-flowStore.ts";
import {
  ATLASSIAN_OAUTH_ENV_HINT,
  readAtlassianOAuthClientId,
  readAtlassianOAuthClientSecret,
} from "./t3team-atlassian-oauthEnv.ts";

/**
 * Finish a flow with the `code` whichever browser completed sign-in delivered.
 *
 * The state is taken out of the store before the exchange, so two concurrent deliveries cannot both
 * redeem it. A failed exchange puts it back with its original creation time: the user gets to retry
 * the same shareable link, without the TTL being extended by the failure.
 *
 * An unknown `state` is a result, not a fault. It happens for an expired link, a replay, and — while
 * the older tab-owned flow still exists — for a callback that belongs to that flow instead, which the
 * callback page has to be able to tell apart from something going wrong.
 */
export function completeAtlassianOAuthFlow(input: {
  readonly state: string;
  readonly code: string;
}) {
  return Effect.gen(function* () {
    const nowMs = yield* Clock.currentTimeMillis;
    const flow = consumePendingAtlassianOAuthFlow(input.state.trim(), nowMs);
    if (!flow) {
      return { status: "unknown_state" } as const;
    }

    const clientId = readAtlassianOAuthClientId();
    const clientSecret = readAtlassianOAuthClientSecret();
    if (!clientId || !clientSecret) {
      return yield* new T3TeamAtlassianError({
        message: `Atlassian OAuth is not configured. Set ${ATLASSIAN_OAUTH_ENV_HINT} on the server.`,
      });
    }

    const grant = yield* Effect.gen(function* () {
      // The client secret is read here and used here. It is never part of a response, and neither is
      // the verifier: a confidential client that leaks either has stopped being confidential.
      const token = yield* tryAtlassianPromise(
        () =>
          exchangeCode(
            { clientId, clientSecret, redirectUri: flow.redirectUri },
            input.code,
            flow.codeVerifier,
          ),
        "Failed to exchange the Atlassian sign-in code.",
      );
      const sites = yield* tryAtlassianPromise(
        () => listAccessibleResources(token.accessToken),
        "Failed to load Atlassian sites.",
      );
      return { token, sites };
    }).pipe(
      Effect.tapCause(() =>
        Effect.sync(() => putPendingAtlassianOAuthFlow(flow, flow.createdAtMs)),
      ),
    );

    // Not restored if persistence fails: the code has already been redeemed at Atlassian and is
    // single use there too, so a retry with the same state could never succeed anyway.
    const accounts = yield* persistAtlassianOAuthAccounts(grant);
    // Marked only now, past every point that can still fail. A poller that saw "pending" right up to
    // this instant and then "unknown" (persistence failing without this call) is told the truth: this
    // link is dead and a fresh one is the only way forward, matching the code's single-use reality.
    markAtlassianOAuthFlowCompleted(input.state.trim(), nowMs);
    return { status: "completed", accounts } as const;
  });
}
