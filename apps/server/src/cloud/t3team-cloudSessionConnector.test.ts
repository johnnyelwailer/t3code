// @effect-diagnostics nodeBuiltinImport:off - A real local HTTP server stands in for the cloud session's server.
import { assert, describe, it } from "@effect/vitest";
import { AuthAccessTokenType, CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as NodeHttp from "node:http";

import {
  type CloudSessionBrokerAccess,
  makeCloudSessionConnector,
} from "./t3team-cloudSessionConnector.ts";

interface FakeSessionServer {
  readonly baseUrl: string;
  readonly revoke: (bearer: string) => void;
}

const readBody = (request: NodeHttp.IncomingMessage) =>
  new Promise<string>((resolve) => {
    const chunks: Array<Buffer> = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

const json = (response: NodeHttp.ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const fakeSessionServer = Effect.acquireRelease(
  Effect.promise(async () => {
    const revoked = new Set<string>();
    let issued = 0;
    const server = NodeHttp.createServer((request, response) => {
      void readBody(request).then((body) => {
        if (request.url === "/oauth/token") {
          const credential = new URLSearchParams(body).get("subject_token") ?? "";
          if (!credential.startsWith("pairing-")) return json(response, 401, {});
          issued += 1;
          return json(response, 200, {
            access_token: `bearer-${issued}`,
            issued_token_type: AuthAccessTokenType,
            token_type: "Bearer",
            expires_in: 3600,
            scope: "orchestration:read",
          });
        }
        if (request.url === "/api/auth/websocket-ticket") {
          const bearer = (request.headers.authorization ?? "").replace(/^Bearer /, "");
          if (!bearer.startsWith("bearer-") || revoked.has(bearer)) {
            return json(response, 401, { _tag: "EnvironmentAuthInvalidError" });
          }
          return json(response, 200, {
            ticket: `ticket-for-${bearer}`,
            expiresAt: "2026-10-24T23:00:00.000Z",
          });
        }
        return json(response, 404, {});
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    return {
      server,
      fake: {
        baseUrl: `127.0.0.1:${port}`,
        revoke: (bearer: string) => revoked.add(bearer),
      } satisfies FakeSessionServer,
    };
  }),
  ({ server }) =>
    Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))),
);

const fakeBroker = (
  fake: FakeSessionServer,
  pairs: Ref.Ref<number>,
  pairFailures: Ref.Ref<ReadonlyArray<CloudSessionFailedError>>,
): CloudSessionBrokerAccess => ({
  attach: ({ sessionId }) =>
    Effect.succeed({
      sessionId,
      environmentId: `env-${sessionId}`,
      label: "Cloud session",
      httpBaseUrl: `http://${fake.baseUrl}`,
      wsBaseUrl: `ws://${fake.baseUrl}`,
    }),
  pair: () =>
    Effect.gen(function* () {
      const failures = yield* Ref.get(pairFailures);
      const next = failures[0];
      if (next !== undefined) {
        yield* Ref.set(pairFailures, failures.slice(1));
        return yield* next;
      }
      const count = yield* Ref.updateAndGet(pairs, (value) => value + 1);
      return `pairing-${count}`;
    }),
});

const inFlight = new CloudSessionFailedError({
  reason: "broker_unavailable",
  message: "The Nexi broker refused a pairing credential: a pairing request is already in flight.",
});

const setup = (failures: ReadonlyArray<CloudSessionFailedError> = []) =>
  Effect.gen(function* () {
    const { fake } = yield* fakeSessionServer;
    const pairs = yield* Ref.make(0);
    const pairFailures = yield* Ref.make(failures);
    const connector = yield* makeCloudSessionConnector(fakeBroker(fake, pairs, pairFailures));
    return { fake, pairs, connector };
  });

describe("makeCloudSessionConnector", () => {
  it.live("pairs once, then reuses the bearer for every later connection", () =>
    Effect.gen(function* () {
      const { pairs, connector } = yield* setup();
      const first = yield* connector.connect("41");
      const second = yield* connector.connect("41");
      assert.strictEqual(yield* Ref.get(pairs), 1);
      assert.strictEqual(first.bearerToken, "bearer-1");
      assert.strictEqual(second.bearerToken, "bearer-1");
      assert.strictEqual(first.environmentId, "env-41");
      const url = new URL(first.socketUrl);
      assert.strictEqual(url.pathname, "/ws");
      assert.strictEqual(url.searchParams.get("wsTicket"), "ticket-for-bearer-1");
      assert.strictEqual(url.searchParams.get("orchestrationProtocol"), "2");
    }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
  );

  it.live("pairs again once when the session rejects the held bearer", () =>
    Effect.gen(function* () {
      const { fake, pairs, connector } = yield* setup();
      yield* connector.connect("41");
      fake.revoke("bearer-1");
      const again = yield* connector.connect("41");
      assert.strictEqual(yield* Ref.get(pairs), 2);
      assert.strictEqual(again.bearerToken, "bearer-2");
    }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
  );

  it.live("retries a pairing the broker refused because another one was in flight", () =>
    Effect.gen(function* () {
      const { pairs, connector } = yield* setup([inFlight]);
      const connection = yield* connector.connect("41");
      assert.strictEqual(yield* Ref.get(pairs), 1);
      assert.strictEqual(connection.bearerToken, "bearer-1");
    }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
  );

  it.live("does not retry a signed-out broker", () =>
    Effect.gen(function* () {
      const signedOut = new CloudSessionFailedError({
        reason: "broker_sign_in_required",
        message: "Sign in again.",
      });
      const { pairs, connector } = yield* setup([signedOut]);
      const exit = yield* Effect.exit(connector.connect("41"));
      assert.isTrue(Exit.isFailure(exit));
      const reason = Exit.isFailure(exit)
        ? Option.getOrUndefined(Exit.findErrorOption(exit))?.reason
        : undefined;
      assert.strictEqual(reason, "broker_sign_in_required");
      assert.strictEqual(yield* Ref.get(pairs), 0);
    }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
  );
});
