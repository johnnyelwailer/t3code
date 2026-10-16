import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Option from "effect/Option";

import { makeAccountSession } from "../account/t3team-accountSession";
import {
  makeMockAccountIssuer,
  memorySecretStorage,
  webCrypto,
} from "../account/t3team-mockAccountIssuer.fixtures";
import { makeMobileNexiBroker } from "../account/t3team-nexiBroker";

/**
 * A broker speaking the distribution's v1 wire format (`nexi-work/broker/src/broker.ts`), which
 * accepts only access tokens the mock Entra issuer minted — so tests run the app's real sign-in and
 * real broker client against it. `hostsEnabled: false` mirrors `NEXI_FF_BROKER_HOSTS` off (404).
 */

export const MOCK_BROKER = "https://broker.mock.test";

export interface MockBrokerState {
  hostsEnabled: boolean;
  hosts: Array<{ id: string; label: string; online: boolean; lastSeen?: string }>;
  sessions: Array<{ runId: string; environmentId?: string; label?: string; since?: string }>;
  /** Paths (and the bearer each carried) of every call the broker received. */
  readonly calls: Array<{
    readonly method: string;
    readonly path: string;
    readonly bearer?: string;
  }>;
  pairings: number;
}

const respond = (request: HttpClientRequest.HttpClientRequest, status: number, body: unknown) =>
  HttpClientResponse.fromWeb(request, new Response(JSON.stringify(body), { status }));

const brokerRoute = (state: MockBrokerState, method: string, path: string) => {
  if (path === "/v1/hosts" && method === "GET") {
    return state.hostsEnabled
      ? ([200, { hosts: state.hosts }] as const)
      : ([404, { error: "not found" }] as const);
  }
  if (path === "/v1/sessions" && method === "GET") {
    return [200, { sessions: state.sessions }] as const;
  }
  const pairing = path.match(/^\/v1\/sessions\/([\w-]+)\/pairing$/);
  if (pairing && method === "POST") {
    const known =
      state.sessions.some((s) => s.runId === pairing[1]) ||
      state.hosts.some((h) => `h-${h.id}` === pairing[1] && h.online);
    if (!known) return [404, { error: "no such session" }] as const;
    state.pairings += 1;
    return [200, { credential: `pairing-${pairing[1]}-${state.pairings}` }] as const;
  }
  return [404, { error: "not found" }] as const;
};

export const makeMockBroker = (initial: Partial<MockBrokerState> = {}) =>
  Effect.gen(function* () {
    const issuer = makeMockAccountIssuer();
    const state: MockBrokerState = {
      hostsEnabled: true,
      hosts: [],
      sessions: [],
      calls: [],
      pairings: 0,
      ...initial,
    };
    const http = HttpClient.make((request, url) => {
      if (url.origin !== MOCK_BROKER) return issuer.httpClient.execute(request).pipe(Effect.orDie);
      const bearer = request.headers.authorization?.replace(/^Bearer /, "");
      state.calls.push({
        method: request.method,
        path: url.pathname,
        ...(bearer ? { bearer } : {}),
      });
      if (bearer === undefined || !issuer.issuedAccessTokens.has(bearer)) {
        return Effect.succeed(respond(request, 401, { error: "unauthorized" }));
      }
      const [status, body] = brokerRoute(state, request.method, url.pathname);
      return Effect.succeed(respond(request, status, body));
    });
    const session = yield* makeAccountSession(issuer.account, {
      http,
      secrets: memorySecretStorage(),
      crypto: webCrypto,
      openAuthSession: () => Effect.succeed({ type: "closed" }),
    });
    const broker = yield* makeMobileNexiBroker({
      url: MOCK_BROKER,
      accessToken: session.accessToken,
    }).pipe(Effect.provideService(HttpClient.HttpClient, http), Effect.map(Option.getOrThrow));

    /** Signs the account in through the issuer's device-code flow, as the user would. */
    const signIn = Effect.gen(function* () {
      issuer.approveDevice();
      yield* session.signIn("code");
      yield* Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            const check = () => session.snapshot().auth._tag === "SignedIn" && resolve();
            session.subscribe(check);
            check();
          }),
      );
    });

    return { issuer, session, broker, state, http, signIn };
  });
