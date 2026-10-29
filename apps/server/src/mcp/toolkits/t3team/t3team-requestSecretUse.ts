/**
 * The `use` half of `request_secret`: after the user approves the card, the saved value becomes a grant
 * `t3_user_secret_run` can use, in place of a one-use ref only another tool could consume. The service
 * method keeps the card and the wait; this decides whether a use may be asked for and registers the grant.
 */
import {
  grantFromRequestUse,
  type ProjectId,
  type SecretRef,
  type UserSecretRequestUse,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import * as SecretRequests from "../../../secrets/SecretRequests.ts";
import { RequestedUserSecrets } from "../../../secrets/t3team-RequestedUserSecrets.ts";
import { isMcpToolEnabled } from "./t3team-mcpToolFeatureGate.ts";

const FLAG_OFF =
  "Requesting a secret for t3_user_secret_run is turned off on this host. Ask without `use`, or continue without it.";

/** Resolves the store, or the message to give the agent. Called before the card is shown. */
export const requestUseTarget = Effect.fn("requestSecretUse.target")(function* (
  use: UserSecretRequestUse,
) {
  if (!isMcpToolEnabled("t3_user_secret_run")) return yield* Effect.fail(FLAG_OFF);
  const store = yield* Effect.serviceOption(RequestedUserSecrets);
  if (Option.isNone(store)) return yield* Effect.fail(FLAG_OFF);
  yield* store.value.check(use.name).pipe(Effect.mapError((error) => error.message));
  return store.value;
});

/** Takes the saved value out of its one-use ref and grants it under the requested name. */
export const grantRequestedUse = Effect.fn("requestSecretUse.grant")(function* (input: {
  readonly store: RequestedUserSecrets["Service"];
  readonly secretRequests: SecretRequests.SecretRequests["Service"];
  readonly use: UserSecretRequestUse;
  readonly ref: SecretRef;
  readonly projectId: ProjectId;
}) {
  const value = yield* input.secretRequests
    .consume({ ref: input.ref, projectId: input.projectId })
    .pipe(Effect.mapError((error) => error.message));
  yield* input.store
    .register(grantFromRequestUse(input.use, yield* Clock.currentTimeMillis), Redacted.make(value))
    .pipe(Effect.mapError((error) => error.message));
  return input.use.name;
});
