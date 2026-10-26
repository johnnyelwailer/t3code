// @effect-diagnostics nodeBuiltinImport:off - the test probes the listener from other local addresses.
// @effect-diagnostics globalFetch:off globalFetchInEffect:off - the test plays the injected command, which talks plain HTTP to its base URL.
import * as NodeOS from "node:os";

import { assert, describe, it } from "@effect/vitest";
import type { UserSecretGrant } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import { maskPatternsFor, SECRET_MASK } from "./t3team-secretMasking.ts";
import { checkGrantUse } from "./t3team-userSecretGrants.ts";
import {
  pathAfterToken,
  rewriteLocation,
  upstreamHeaders,
  upstreamUrl,
  type ForwardedRequest,
  type UpstreamFetch,
} from "./t3team-userSecretRequestForward.ts";
import {
  makeRequestInjection,
  UserSecretRequestInjection,
} from "./t3team-UserSecretRequestInjection.ts";
import { REQUEST_LISTENER_HOST } from "./t3team-userSecretRequestListener.ts";
import { UserSecretRefused, UserSecretResolver } from "./t3team-UserSecretResolver.ts";

const VALUE = "dummy-request-value-5c1e";
const HOST = "api.example.com";
const BASE = "http://127.0.0.1:1/token";

describe("forwarding rules", () => {
  it("requires the exact token as the first path segment", () => {
    assert.strictEqual(pathAfterToken("/abc/v1/user?x=1", "abc"), "/v1/user?x=1");
    assert.strictEqual(pathAfterToken("/abc", "abc"), "/");
    assert.strictEqual(pathAfterToken("/abc?x=1", "abc"), "/?x=1");
    for (const url of ["/", "/abd/v1", "/abcd/v1", "/v1/abc", "", undefined]) {
      assert.isUndefined(pathAfterToken(url, "abc"));
    }
  });

  it("forwards only to the route's host over https", () => {
    assert.strictEqual(upstreamUrl(HOST, "/v1?q=1")?.toString(), `https://${HOST}/v1?q=1`);
    assert.strictEqual(upstreamUrl(HOST, "//evil.net/x")?.host, HOST);
    assert.strictEqual(upstreamUrl(HOST, "/@evil.net")?.host, HOST);
  });

  it("points same-host redirects back through the listener and leaves others alone", () => {
    assert.strictEqual(rewriteLocation("/next?p=2", HOST, BASE), `${BASE}/next?p=2`);
    assert.strictEqual(rewriteLocation(`https://${HOST}/a`, HOST, BASE), `${BASE}/a`);
    assert.strictEqual(rewriteLocation("https://evil.net/a", HOST, BASE), "https://evil.net/a");
    assert.strictEqual(rewriteLocation(`http://${HOST}/a`, HOST, BASE), `http://${HOST}/a`);
  });

  it("replaces any credential header the command sent and drops hop-by-hop headers", () => {
    const headers = upstreamHeaders(
      {
        authorization: "Bearer forged",
        host: "127.0.0.1:1",
        connection: "keep-alive",
        accept: "*/*",
      },
      {
        name: HOST,
        host: HOST,
        header: { name: "Authorization", value: Redacted.make(`Bearer ${VALUE}`) },
      },
    );
    assert.strictEqual(headers.get("authorization"), `Bearer ${VALUE}`);
    assert.isNull(headers.get("host"));
    assert.isNull(headers.get("connection"));
    assert.strictEqual(headers.get("accept"), "*/*");
  });
});

const grant: UserSecretGrant = {
  name: "API_TOKEN",
  kind: "secret",
  deliveryModes: ["requestInjection"],
  destinations: [HOST],
  approval: "never",
};

const Resolver = Layer.succeed(
  UserSecretResolver,
  UserSecretResolver.of({
    grant: (name) => (name === grant.name ? grant : undefined),
    resolve: (input) => {
      const refusal = checkGrantUse(
        input.name,
        input.name === grant.name ? grant : undefined,
        input.mode,
        input.destination,
        0,
      );
      return refusal === undefined
        ? Effect.succeed(Redacted.make(VALUE))
        : Effect.fail(new UserSecretRefused({ name: input.name, reason: refusal }));
    },
  }),
);

const upstreamCalls: Array<{ readonly url: string; readonly authorization: string | null }> = [];
const fakeUpstream: UpstreamFetch = async (url, init) => {
  const authorization = new Headers(init.headers).get("authorization");
  upstreamCalls.push({ url, authorization });
  const path = new URL(url).pathname;
  if (path === "/same")
    return new Response(null, { status: 302, headers: { location: "/landing" } });
  if (path === "/away")
    return new Response(null, { status: 302, headers: { location: "https://evil.net/x" } });
  return new Response(`echo ${authorization} ${Buffer.from(VALUE).toString("base64")}`, {
    status: 200,
    headers: { "x-echo": `${authorization}` },
  });
};

const Requests = Layer.effect(UserSecretRequestInjection, makeRequestInjection(fakeUpstream)).pipe(
  Layer.provide(Resolver),
);

const withListener = <A>(
  body: (baseUrl: string, forwarded: Array<ForwardedRequest>) => Promise<A>,
) =>
  Effect.gen(function* () {
    upstreamCalls.length = 0;
    const injection = yield* UserSecretRequestInjection;
    const forwarded: Array<ForwardedRequest> = [];
    const baseUrl = yield* injection.open({
      name: "API_TOKEN",
      host: HOST,
      patterns: maskPatternsFor(VALUE),
      forwarded,
    });
    return yield* Effect.promise(() => body(baseUrl, forwarded));
  }).pipe(Effect.scoped, Effect.provide(Requests));

describe("request listener", () => {
  it.live("adds the credential upstream and masks it wherever it is echoed back", () =>
    withListener(async (baseUrl, forwarded) => {
      const response = await fetch(`${baseUrl}/v1/user?x=1`, {
        headers: { authorization: "Bearer forged" },
      });
      const body = await response.text();
      assert.deepStrictEqual(upstreamCalls, [
        { url: `https://${HOST}/v1/user?x=1`, authorization: `Bearer ${VALUE}` },
      ]);
      assert.notInclude(body, VALUE);
      assert.notInclude(body, Buffer.from(VALUE).toString("base64"));
      assert.strictEqual(body, `echo Bearer ${SECRET_MASK} ${SECRET_MASK}`);
      assert.strictEqual(response.headers.get("x-echo"), `Bearer ${SECRET_MASK}`);
      assert.deepStrictEqual(forwarded, [
        { name: "API_TOKEN", host: HOST, method: "GET", status: 200 },
      ]);
    }),
  );

  it.live("forwards nothing without the run's token", () =>
    withListener(async (baseUrl, forwarded) => {
      const origin = new URL(baseUrl).origin;
      for (const url of [`${origin}/v1/user`, `${origin}/wrong-token/v1/user`]) {
        assert.strictEqual((await fetch(url)).status, 403);
      }
      assert.lengthOf(upstreamCalls, 0);
      assert.lengthOf(forwarded, 0);
    }),
  );

  it.live("rewrites a same-host redirect and passes a cross-host one untouched, unfollowed", () =>
    withListener(async (baseUrl) => {
      const same = await fetch(`${baseUrl}/same`, { redirect: "manual" });
      assert.strictEqual(same.headers.get("location"), `${baseUrl}/landing`);
      const away = await fetch(`${baseUrl}/away`, { redirect: "manual" });
      assert.strictEqual(away.headers.get("location"), "https://evil.net/x");
      assert.deepStrictEqual(
        upstreamCalls.map((call) => new URL(call.url).host),
        [HOST, HOST],
      );
    }),
  );

  it.live("binds the IPv4 loopback address only", () =>
    withListener(async (baseUrl) => {
      const listener = new URL(baseUrl);
      assert.strictEqual(listener.hostname, REQUEST_LISTENER_HOST);
      const external = Object.values(NodeOS.networkInterfaces())
        .flat()
        .find((address) => address?.family === "IPv4" && !address.internal)?.address;
      const others = [`[::1]`, ...(external === undefined ? [] : [external])];
      for (const host of others) {
        const reached = await fetch(`http://${host}:${listener.port}${listener.pathname}/v1`).then(
          () => true,
          () => false,
        );
        assert.isFalse(reached, host);
      }
    }),
  );

  it.live("closes when the command's scope ends", () =>
    Effect.gen(function* () {
      const baseUrl = yield* withListener(async (url) => url);
      const reached = yield* Effect.promise(() =>
        fetch(`${baseUrl}/v1`).then(
          () => true,
          () => false,
        ),
      );
      assert.isFalse(reached);
    }),
  );

  it.effect("refuses to open a listener for another host or an ungranted name", () =>
    Effect.gen(function* () {
      const injection = yield* UserSecretRequestInjection;
      const refusal = (name: string, host: string) =>
        injection.open({ name, host, patterns: [], forwarded: [] }).pipe(
          Effect.scoped,
          Effect.flip,
          Effect.map((error) => (error._tag === "UserSecretRefused" ? error.reason : error._tag)),
        );
      assert.strictEqual(yield* refusal("API_TOKEN", "evil.net"), "destination_not_allowed");
      assert.strictEqual(yield* refusal("OTHER", HOST), "not_granted");
    }).pipe(Effect.provide(Requests)),
  );
});
