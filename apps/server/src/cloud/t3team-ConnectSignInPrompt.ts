import type {
  EnvironmentConnectSignInAttempt,
  EnvironmentConnectSignInStatus,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import { CLOUD_LINKED_USER_ID } from "./config.ts";
import * as ConnectCredentialMinter from "./t3team-ConnectCredentialMinter.ts";

/**
 * The user-driven T3 Connect sign-in prompt.
 *
 * A linked environment can lack the per-user T3 Connect credential that cloud sessions need.
 * The server only REPORTS that state (`status`); it never opens a browser by itself. The
 * browser round-trip starts only when the user asks for it (`start`, behind the notice's
 * "Sign in" action). A failed or abandoned attempt is remembered as `failed` and is never
 * retried on its own — the user decides whether to try again.
 */
export class ConnectSignInPrompt extends Context.Service<
  ConnectSignInPrompt,
  {
    readonly status: Effect.Effect<EnvironmentConnectSignInStatus>;
    /** Start (or join) the browser sign-in the user just asked for; returns without waiting. */
    readonly start: Effect.Effect<EnvironmentConnectSignInStatus>;
  }
>()("t3/cloud/t3team-ConnectSignInPrompt/ConnectSignInPrompt") {}

export const make = Effect.gen(function* () {
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const cloudCli = yield* CliTokenManager.CloudCliTokenManager;
  const minter = yield* ConnectCredentialMinter.ConnectCredentialMinter;
  // Attempts run in the server-lifetime scope so a request that returns early does not cancel
  // the sign-in the user is completing in their browser.
  const scope = yield* Effect.scope;
  const attempt = yield* Ref.make<EnvironmentConnectSignInAttempt>("idle");

  const credentialRequired = Effect.gen(function* () {
    const linked = yield* secrets.get(CLOUD_LINKED_USER_ID).pipe(
      Effect.map(Option.isSome),
      Effect.orElseSucceed(() => false),
    );
    if (!linked) return false;
    // `getExisting` refreshes a near-expiry credential silently; an unreadable or
    // unrefreshable one counts as missing, because the remedy (signing in) is the same.
    const existing = yield* cloudCli.getExisting.pipe(
      Effect.orElseSucceed((): Option.Option<CliTokenManager.PersistedToken> => Option.none()),
    );
    return Option.isNone(existing);
  });

  const status = Effect.gen(function* () {
    const current = yield* Ref.get(attempt);
    const required = yield* credentialRequired;
    // A finished sign-in leaves nothing to report; drop a stale failure with it.
    if (!required && current === "failed") yield* Ref.set(attempt, "idle");
    return { required, attempt: required ? current : "idle" } as const;
  });

  const start = Effect.gen(function* () {
    const current = yield* status;
    if (!current.required || current.attempt === "in_progress") return current;
    yield* Ref.set(attempt, "in_progress");
    yield* minter.mint().pipe(
      Effect.exit,
      Effect.flatMap((exit) => Ref.set(attempt, Exit.isSuccess(exit) ? "idle" : "failed")),
      Effect.forkIn(scope),
    );
    return { required: true, attempt: "in_progress" } as const;
  });

  return ConnectSignInPrompt.of({ status, start });
});

export const layer = Layer.effect(ConnectSignInPrompt, make);
