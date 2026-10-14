import type { Tokens } from "@t3tools/shared/t3team-accountOAuth";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";

/**
 * Where one account's sign-in lives on the phone: the refresh grant and the display name in the
 * platform keychain (`AccountSecretStorage`, expo-secure-store in the app), access tokens in memory
 * per resource. Mirrors the server's `t3team-AccountTokenStore`.
 */

/** The keychain seam: expo-secure-store in the app, a Map in tests. Never throws. */
export interface AccountSecretStorage {
  readonly get: (key: string) => Effect.Effect<string | null>;
  readonly set: (key: string, value: string) => Effect.Effect<void>;
  readonly remove: (key: string) => Effect.Effect<void>;
}

/** Refresh this long before the stated expiry, so a token never dies mid-request. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

interface CachedAccess {
  readonly token: string;
  readonly expiresAtMs: number;
}

/** Display name from the token's OIDC `name` claim; the resource server verifies the token. */
export const nameOf = (token: string): string | null => {
  const payload = Base64Url.decodeString(token.split(".")[1] ?? "");
  if (Result.isFailure(payload)) return null;
  try {
    const claims: unknown = JSON.parse(payload.success);
    return typeof claims === "object" &&
      claims !== null &&
      "name" in claims &&
      typeof claims.name === "string"
      ? claims.name
      : null;
  } catch {
    return null;
  }
};

export const makeAccountTokenStore = Effect.fn("mobile.account.tokens.make")(function* (
  accountId: string,
  secrets: AccountSecretStorage,
) {
  const grantKey = `t3team.account.${accountId}.refresh-token`;
  /** Kept beside the grant so a cold start shows who is signed in before any token is minted. */
  const nameKey = `t3team.account.${accountId}.name`;
  const cached = yield* Ref.make(new Map<string, CachedAccess>());
  const name = yield* Ref.make(yield* secrets.get(nameKey));

  const grant = secrets.get(grantKey).pipe(Effect.map(Option.fromNullishOr));

  const store = Effect.fn("mobile.account.tokens.store")(function* (
    resource: string,
    body: Tokens,
  ) {
    if (body.refresh_token) yield* secrets.set(grantKey, body.refresh_token);
    const expiresAtMs = (yield* Clock.currentTimeMillis) + body.expires_in * 1000;
    yield* Ref.update(cached, (map) =>
      new Map(map).set(resource, { token: body.access_token, expiresAtMs }),
    );
    const named = nameOf(body.access_token);
    if (named !== null && named !== (yield* Ref.get(name))) {
      yield* Ref.set(name, named);
      yield* secrets.set(nameKey, named);
    }
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
    yield* secrets.remove(grantKey);
    yield* secrets.remove(nameKey);
    yield* Ref.set(cached, new Map());
    yield* Ref.set(name, null);
  });

  return { grant, store, fresh, signedIn, name: Ref.get(name), clear } as const;
});

export type AccountTokenStore = Effect.Success<ReturnType<typeof makeAccountTokenStore>>;
