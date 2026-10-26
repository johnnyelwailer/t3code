// @effect-diagnostics globalFetch:off - forwarding needs `redirect: "manual"` and the raw upstream Response; Node's fetch keeps its normal certificate checks.
/**
 * Request injection: the command never holds the value. For each granted destination it gets a
 * local base URL; requests sent there reach that one host over HTTPS with the entry's credential
 * header added (`t3team-userSecretRequestListener.ts`). No CA is created and nothing is trusted by
 * the child, so tools that cannot take a base URL (a TLS-terminating forward proxy would serve
 * them) are not covered.
 *
 * `headersFor` is the per-destination decision (grant, login-slot refusal, host match, header
 * template); `open` makes it once per listener and never again per request.
 */
import type { UserSecretName } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type * as Scope from "effect/Scope";

import { renderRequestHeader } from "./t3team-userSecretGrants.ts";
import type { ForwardedRequest, UpstreamFetch } from "./t3team-userSecretRequestForward.ts";
import {
  openRequestListener,
  type UserSecretListenerError,
} from "./t3team-userSecretRequestListener.ts";
import { UserSecretRefused, UserSecretResolver } from "./t3team-UserSecretResolver.ts";

export interface InjectedHeader {
  readonly name: string;
  readonly value: Redacted.Redacted<string>;
}

export class UserSecretRequestInjection extends Context.Service<
  UserSecretRequestInjection,
  {
    /** Headers to add to one request for `host`; refused when any entry may not go there. */
    readonly headersFor: (input: {
      readonly names: ReadonlyArray<UserSecretName>;
      readonly host: string;
    }) => Effect.Effect<ReadonlyArray<InjectedHeader>, UserSecretRefused>;
    /** A base URL forwarding to `host` with `name`'s credential, open while `Scope` is. */
    readonly open: (input: {
      readonly name: UserSecretName;
      readonly host: string;
      readonly patterns: ReadonlyArray<string>;
      readonly forwarded: Array<ForwardedRequest>;
    }) => Effect.Effect<string, UserSecretRefused | UserSecretListenerError, Scope.Scope>;
  }
>()("t3/secrets/t3team-UserSecretRequestInjection/UserSecretRequestInjection") {}

export const makeRequestInjection = Effect.fn("UserSecretRequestInjection.make")(function* (
  fetch: UpstreamFetch,
) {
  const resolver = yield* UserSecretResolver;
  const headersFor: UserSecretRequestInjection["Service"]["headersFor"] = Effect.fn(
    "UserSecretRequestInjection.headersFor",
  )(function* ({ names, host }) {
    const headers: Array<InjectedHeader> = [];
    for (const name of names) {
      const value = yield* resolver.resolve({
        name,
        mode: "requestInjection",
        destination: host,
      });
      const grant = resolver.grant(name);
      if (grant === undefined) return yield* new UserSecretRefused({ name, reason: "not_granted" });
      const header = renderRequestHeader(grant, Redacted.value(value));
      headers.push({ name: header.name, value: Redacted.make(header.value) });
    }
    return headers;
  });
  const open: UserSecretRequestInjection["Service"]["open"] = Effect.fn(
    "UserSecretRequestInjection.open",
  )(function* ({ name, host, patterns, forwarded }) {
    const [header] = yield* headersFor({ names: [name], host });
    if (header === undefined) return yield* new UserSecretRefused({ name, reason: "not_granted" });
    return yield* openRequestListener({
      route: { name, host, header },
      patterns,
      fetch,
      forwarded,
    });
  });
  return UserSecretRequestInjection.of({ headersFor, open });
});

export const UserSecretRequestInjectionLive = Layer.effect(
  UserSecretRequestInjection,
  makeRequestInjection((url, init) => fetch(url, init)),
);
