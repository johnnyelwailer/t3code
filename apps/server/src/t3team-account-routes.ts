import { AuthAccessWriteScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/http";

import { Accounts } from "./account/t3team-Accounts.ts";
import type { AccountError } from "./account/t3team-AccountError.ts";
import { credentialRoute } from "./t3team-credentialRoute.ts";

/**
 * The accounts this server signs the user in to (`t3team-Accounts`). Listing shows only labels and
 * the signed-in name, so any paired client may read it; signing in or out changes this server's
 * credentials and needs access:write.
 */

const onError = (error: AccountError) => ({ error: error.reason, message: error.message });

const accountId = Effect.gen(function* () {
  return (yield* HttpRouter.params)["accountId"] ?? "";
});

export const t3teamAccountRouteLayer = Layer.mergeAll(
  credentialRoute({
    method: "GET",
    path: "/api/t3team/accounts",
    scope: AuthOrchestrationReadScope,
    handler: Effect.gen(function* () {
      return { accounts: yield* (yield* Accounts).list };
    }),
    onError,
  }),
  credentialRoute({
    method: "POST",
    path: "/api/t3team/accounts/:accountId/sign-in",
    scope: AuthAccessWriteScope,
    handler: Effect.gen(function* () {
      return yield* (yield* Accounts).signIn(yield* accountId);
    }),
    onError,
  }),
  credentialRoute({
    method: "POST",
    path: "/api/t3team/accounts/:accountId/sign-out",
    scope: AuthAccessWriteScope,
    handler: Effect.gen(function* () {
      yield* (yield* Accounts).signOut(yield* accountId);
      return { ok: true };
    }),
    onError,
  }),
);
