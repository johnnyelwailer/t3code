import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as RemoteEnvironmentAuthorization from "../authorization/service.ts";
import { RelayConnectionTarget, type PreparedConnection } from "../connection/model.ts";
import * as ManagedRelay from "../relay/managedRelay.ts";
import * as RpcHttp from "../rpc/http.ts";
import { postEnvironmentJson } from "./t3team-environmentJsonPost.ts";

const TARGET = new RelayConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Remote environment",
});
const prepared = (
  httpAuthorization: PreparedConnection["httpAuthorization"],
): PreparedConnection => ({
  environmentId: TARGET.environmentId,
  label: TARGET.label,
  httpBaseUrl: "https://previous.example.test",
  socketUrl: "wss://previous.example.test/ws",
  httpAuthorization,
  target: TARGET,
});
const BODY = { threadId: "thread-1", value: true, correlationId: "ask-1" };
const PATH = "/api/t3team/thread/workflow/resolve-input";

function makeHarness(reply: (requestNumber: number) => Response) {
  const calls: Array<{ readonly url: string; readonly init: RequestInit }> = [];
  const proofs: Array<ManagedRelay.ManagedRelayDpopProofInput> = [];
  const signer = ManagedRelay.ManagedRelayDpopSigner.of({
    thumbprint: Effect.succeed("test-thumbprint"),
    createProof: (input) =>
      Effect.sync(() => {
        proofs.push(input);
        return `proof-${proofs.length}`;
      }),
  });
  const remoteAuthorization = RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization.of({
    authorizeBearer: () => Effect.die("unexpected"),
    authorizeDpop: () => Effect.die("unexpected"),
    authorizeDpopHttp: (input) =>
      Effect.succeed({
        environmentId: TARGET.environmentId,
        label: TARGET.label,
        httpBaseUrl: "https://current.example.test",
        httpAuthorization: {
          _tag: "Dpop" as const,
          accessToken: input.rejectedAccessToken === undefined ? "current-token" : "renewed-token",
          expiresAtEpochMs: 3_600_000,
        },
      }),
  });
  const fetchFn: typeof fetch = async (request, init) => {
    calls.push({ url: String(request), init: init ?? {} });
    return reply(calls.length);
  };
  return {
    calls,
    proofs,
    // The optional services a DPoP connection needs, provided the way the app runtime does.
    services: Layer.mergeAll(
      Layer.succeed(ManagedRelay.ManagedRelayDpopSigner, signer),
      Layer.succeed(
        RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization,
        remoteAuthorization,
      ),
      RpcHttp.layerRemoteHttpClient(fetchFn),
    ),
  };
}

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const headerOf = (init: RequestInit, name: string) =>
  new Headers(init.headers).get(name) ?? undefined;

describe("postEnvironmentJson", () => {
  it.effect("signs a DPoP request for the exact URL and renews once when the route rejects it", () =>
    Effect.gen(function* () {
      const harness = makeHarness((n) =>
        n === 1
          ? Response.json({ error: "expired" }, { status: 401 })
          : Response.json({ ok: true }),
      );

      const result = yield* postEnvironmentJson({
        prepared: prepared({ _tag: "Dpop", accessToken: "expired-token", expiresAtEpochMs: 0 }),
        path: PATH,
        body: BODY,
      }).pipe(Effect.provide(harness.services));

      expect(result).toEqual({ status: 200, payload: { ok: true } });
      expect(harness.calls.map((call) => call.url)).toEqual([
        `https://current.example.test${PATH}`,
        `https://current.example.test${PATH}`,
      ]);
      expect(harness.calls.map((call) => headerOf(call.init, "authorization"))).toEqual([
        "DPoP current-token",
        "DPoP renewed-token",
      ]);
      expect(harness.calls.map((call) => headerOf(call.init, "dpop"))).toEqual([
        "proof-1",
        "proof-2",
      ]);
      expect(harness.proofs.map((proof) => [proof.method, proof.url])).toEqual([
        ["POST", `https://current.example.test${PATH}`],
        ["POST", `https://current.example.test${PATH}`],
      ]);
      expect(decodeJson(String(harness.calls[0]?.init.body))).toEqual(BODY);
    }),
  );

  it.effect("sends a bearer token and hands a route's error body back with its status", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() =>
        Response.json({ error: "This decision is no longer pending." }, { status: 400 }),
      );

      const result = yield* postEnvironmentJson({
        prepared: prepared({ _tag: "Bearer", token: "session-bearer" }),
        path: PATH,
        body: BODY,
      }).pipe(Effect.provide(harness.services));

      expect(result).toEqual({
        status: 400,
        payload: { error: "This decision is no longer pending." },
      });
      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0]?.url).toBe(`https://previous.example.test${PATH}`);
      expect(headerOf(harness.calls[0]!.init, "authorization")).toBe("Bearer session-bearer");
      expect(harness.proofs).toHaveLength(0);
    }),
  );
});
