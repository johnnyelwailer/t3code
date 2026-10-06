import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import type * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import type { Tokens } from "./t3team-AccountOAuth.ts";

/**
 * Where one account's sign-in lives: the refresh grant in this install's secret store (it survives
 * restarts), access tokens in memory per resource, and the display name the issuer last sent.
 */

/** Refresh this long before the stated expiry, so a token never dies mid-request. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

interface CachedAccess {
  readonly token: string;
  readonly expiresAtMs: number;
}

/** Display name from the token's OIDC `name` claim; the token itself is verified by its audience. */
const nameOf = (token: string): string | null => {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
    return typeof payload.name === "string" ? payload.name : null;
  } catch {
    return null;
  }
};

export const makeAccountTokenStore = Effect.fn("account.tokens.make")(function* (
  accountId: string,
  secrets: ServerSecretStore.ServerSecretStore["Service"],
) {
  const secretName = `account.${accountId}.refresh-token`;
  const cached = yield* Ref.make(new Map<string, CachedAccess>());
  const name = yield* Ref.make<string | null>(null);

  const grant = secrets.get(secretName).pipe(
    Effect.map(Option.map((bytes) => new TextDecoder().decode(bytes))),
    Effect.orElseSucceed(() => Option.none<string>()),
  );

  const store = Effect.fn("account.tokens.store")(function* (resource: string, body: Tokens) {
    if (body.refresh_token) {
      yield* secrets
        .set(secretName, new TextEncoder().encode(body.refresh_token))
        .pipe(Effect.orDie);
    }
    const expiresAtMs = (yield* Clock.currentTimeMillis) + body.expires_in * 1000;
    yield* Ref.update(cached, (map) =>
      new Map(map).set(resource, { token: body.access_token, expiresAtMs }),
    );
    const named = nameOf(body.access_token);
    if (named !== null) yield* Ref.set(name, named);
    return body.access_token;
  });

  /** A cached token for `resource` that is not about to expire. */
  const fresh = (resource: string) =>
    Effect.gen(function* () {
      const access = (yield* Ref.get(cached)).get(resource);
      const now = yield* Clock.currentTimeMillis;
      return Option.filter(
        Option.fromNullishOr(access),
        (a) => a.expiresAtMs - EXPIRY_MARGIN_MS > now,
      ).pipe(Option.map((a) => a.token));
    });

  /** True when there is anything to call "signed in": a live token or a stored grant. */
  const signedIn = Effect.gen(function* () {
    return (yield* Ref.get(cached)).size > 0 || Option.isSome(yield* grant);
  });

  const clear = Effect.gen(function* () {
    yield* secrets.remove(secretName).pipe(Effect.ignore);
    yield* Ref.set(cached, new Map());
    yield* Ref.set(name, null);
  });

  return { grant, store, fresh, signedIn, name: Ref.get(name), clear } as const;
});
