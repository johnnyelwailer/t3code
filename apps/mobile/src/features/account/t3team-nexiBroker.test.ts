import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

import { makeAccountSession } from "./t3team-accountSession";
import {
  makeMockAccountIssuer,
  memorySecretStorage,
  webCrypto,
} from "./t3team-mockAccountIssuer.fixtures";
import { makeMobileNexiBroker } from "./t3team-nexiBroker";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const BROKER = "https://broker.mock.test";

const respond = (
  request: Parameters<typeof HttpClientResponse.fromWeb>[0],
  status: number,
  body: unknown,
) => HttpClientResponse.fromWeb(request, new Response(JSON.stringify(body), { status }));

/** The mock issuer, and a broker that accepts only access tokens that issuer minted. */
const setup = Effect.gen(function* () {
  const issuer = makeMockAccountIssuer();
  const seen: Array<string | undefined> = [];
  const http = HttpClient.make((request, url) => {
    if (url.origin !== BROKER) return issuer.httpClient.execute(request).pipe(Effect.orDie);
    const bearer = request.headers.authorization?.replace(/^Bearer /, "");
    seen.push(bearer);
    return Effect.succeed(
      bearer !== undefined && issuer.issuedAccessTokens.has(bearer)
        ? respond(request, 200, { sessions: [{ runId: "42", environmentId: "env-1" }] })
        : respond(request, 401, { error: "unauthorized" }),
    );
  });
  const session = yield* makeAccountSession(issuer.account, {
    http,
    secrets: memorySecretStorage(),
    crypto: webCrypto,
    openAuthSession: () => Effect.succeed({ type: "closed" }),
  });
  const broker = yield* makeMobileNexiBroker({
    url: `${BROKER}/`,
    accessToken: session.accessToken,
  }).pipe(Effect.provideService(HttpClient.HttpClient, http), Effect.map(Option.getOrThrow));
  return { issuer, session, broker, seen };
});

describe("the Nexi broker on the app's Microsoft account", () => {
  it.live("asks for sign-in while signed out, then lists sessions with the Entra token", () =>
    Effect.gen(function* () {
      const { issuer, session, broker, seen } = yield* setup;

      const signedOut = yield* Effect.flip(broker.listSessions);
      expect(signedOut).toMatchObject({ reason: "broker_sign_in_required" });
      expect(seen).toEqual([]);

      issuer.approveDevice();
      yield* session.signIn;
      yield* Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            const check = () => session.snapshot().auth._tag === "SignedIn" && resolve();
            session.subscribe(check);
            check();
          }),
      );

      expect(yield* broker.listSessions).toEqual([{ runId: "42", environmentId: "env-1" }]);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.split(".")).toHaveLength(3);
    }),
  );

  it.effect("treats a broker rejecting the token as sign-in required", () =>
    Effect.gen(function* () {
      const rejecting = yield* makeMobileNexiBroker({
        url: BROKER,
        accessToken: () => Effect.succeed("revoked.token.value"),
      }).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make((request) => Effect.succeed(respond(request, 401, {}))),
        ),
        Effect.map(Option.getOrThrow),
      );

      expect(yield* Effect.flip(rejecting.listSessions)).toMatchObject({
        reason: "broker_sign_in_required",
        message: "Your sign-in was not accepted. Sign in again.",
      });
    }),
  );

  it.effect("is absent for a build without a broker URL", () =>
    Effect.gen(function* () {
      const none = yield* makeMobileNexiBroker({
        url: null,
        accessToken: () => Effect.succeed("unused"),
      }).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.die("no broker to call")),
        ),
      );
      expect(Option.isNone(none)).toBe(true);
    }),
  );
});
