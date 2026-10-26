/**
 * Request injection: a local forward proxy adds an entry's credential header to a request only
 * when the request's host is one of the entry's destinations, so the command never holds the value.
 *
 * `headersFor` is the complete decision the proxy makes per request and is live. The proxy itself
 * is not built yet: HTTPS needs it to terminate TLS for allowed hosts with a per-session CA that
 * only the child process trusts, and to verify the real upstream certificate itself. Until that
 * lands with its own review, no tool offers request injection and agents use process injection.
 */
import type { UserSecretName } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import { renderRequestHeader } from "./t3team-userSecretGrants.ts";
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
  }
>()("t3/secrets/t3team-UserSecretRequestInjection/UserSecretRequestInjection") {}

const make = Effect.gen(function* () {
  const resolver = yield* UserSecretResolver;
  return UserSecretRequestInjection.of({
    headersFor: Effect.fn("UserSecretRequestInjection.headersFor")(function* ({ names, host }) {
      const headers: Array<InjectedHeader> = [];
      for (const name of names) {
        const value = yield* resolver.resolve({
          name,
          mode: "requestInjection",
          destination: host,
        });
        const grant = resolver.grant(name);
        if (grant === undefined)
          return yield* new UserSecretRefused({ name, reason: "not_granted" });
        const header = renderRequestHeader(grant, Redacted.value(value));
        headers.push({ name: header.name, value: Redacted.make(header.value) });
      }
      return headers;
    }),
  });
});

export const UserSecretRequestInjectionLive = Layer.effect(UserSecretRequestInjection, make);
