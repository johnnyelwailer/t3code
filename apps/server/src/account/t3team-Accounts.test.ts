// @effect-diagnostics preferSchemaOverJson:off - the fake issuer writes raw JSON bodies, as a real one does.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { ExternalLauncherBrowserSpawnError } from "@t3tools/contracts";
import type { AccountDefinition } from "@t3team/pack-api";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ExternalLauncher from "../process/externalLauncher.ts";
import { Accounts, layerFor } from "./t3team-Accounts.ts";

const ACME: AccountDefinition = {
  id: "acme",
  label: "Acme",
  issuer: {
    clientId: "client-1",
    authorizationEndpoint: "https://id.example.test/oauth2/authorize",
    tokenEndpoint: "https://id.example.test/oauth2/token",
    deviceAuthorizationEndpoint: "https://id.example.test/oauth2/devicecode",
  },
  baseScopes: "openid profile offline_access",
  resources: { broker: "api://acme-broker/access", knowledge: "api://acme-knowledge/read" },
  signInResource: "broker",
};
const SECRET = "account.acme.refresh-token";
const accessTokenFor = (name: string) =>
  `h.${Buffer.from(JSON.stringify({ name })).toString("base64url")}.s`;

interface Reply {
  readonly status: number;
  readonly body: unknown;
}
interface IssuerFake {
  readonly requests: Array<{ readonly path: string; readonly params: URLSearchParams }>;
  /** Replies to the token endpoint, consumed in order; the last one repeats. */
  readonly tokenReplies: Array<Reply>;
}

const issuerLayer = (fake: IssuerFake) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        const body =
          request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";
        const path = new URL(request.url).pathname;
        fake.requests.push({ path, params: new URLSearchParams(body) });
        const reply: Reply = path.endsWith("/devicecode")
          ? {
              status: 200,
              body: {
                device_code: "dc-1",
                user_code: "ABCD-EFGH",
                verification_uri: "https://id.example.test/device",
                expires_in: 900,
                interval: 5,
              },
            }
          : ((fake.tokenReplies.length > 1 ? fake.tokenReplies.shift() : fake.tokenReplies[0]) ?? {
              status: 400,
              body: { error: "invalid_grant" },
            });
        return HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(reply.body), {
            status: reply.status,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    ),
  );

const memorySecrets = (initial: Record<string, string> = {}) => {
  const values = new Map<string, Uint8Array>(
    Object.entries(initial).map(([k, v]) => [k, new TextEncoder().encode(v)] as const),
  );
  const layer = Layer.succeed(ServerSecretStore.ServerSecretStore, {
    get: (name) => Effect.sync(() => Option.fromNullishOr(values.get(name))),
    set: (name, value) => Effect.sync(() => void values.set(name, value)),
    create: (name, value) => Effect.sync(() => void values.set(name, value)),
    getOrCreateRandom: () => Effect.die("unused"),
    remove: (name) => Effect.sync(() => void values.delete(name)),
  });
  const read = (name: string) => {
    const value = values.get(name);
    return value === undefined ? undefined : new TextDecoder().decode(value);
  };
  return { layer, read };
};

/** A machine without a browser: the device code is the only way in, and no real browser opens. */
const noBrowser = Layer.mock(ExternalLauncher.ExternalLauncher)({
  launchBrowser: (target) =>
    Effect.fail(
      new ExternalLauncherBrowserSpawnError({ command: "open", args: [], target, cause: null }),
    ),
});

const accountsWith = (
  fake: IssuerFake,
  secrets: ReturnType<typeof memorySecrets>,
  launcher: Layer.Layer<ExternalLauncher.ExternalLauncher> = noBrowser,
  definitions: ReadonlyArray<AccountDefinition> = [ACME],
) =>
  layerFor(definitions).pipe(
    Layer.provide(Layer.mergeAll(issuerLayer(fake), secrets.layer, launcher)),
  );

/** The account under test, with its operations bound to `acme`. */
const acme = Effect.gen(function* () {
  const accounts = yield* Accounts;
  return {
    status: accounts.list.pipe(Effect.map((list) => list.find((a) => a.id === "acme")!)),
    signIn: accounts.signIn("acme"),
    signOut: accounts.signOut("acme"),
    accessToken: accounts.accessToken("acme", "broker"),
    accessTokenFor: (resource: string) => accounts.accessToken("acme", resource),
  };
});

it.layer(NodeServices.layer)("Accounts", (it) => {
  it.effect("an account the build does not define says so instead of asking for a sign-in", () =>
    Effect.gen(function* () {
      const accounts = yield* Accounts;
      const failure = yield* Effect.flip(accounts.accessToken("other", "broker"));
      assert.equal(failure.reason, "unavailable");
      assert.deepEqual(
        (yield* accounts.list).map((a) => a.id),
        ["acme"],
      );
    }).pipe(Effect.provide(accountsWith({ requests: [], tokenReplies: [] }, memorySecrets()))),
  );

  it.effect("signed out: an access token asks for the sign-in, never a technical error", () =>
    Effect.gen(function* () {
      const auth = yield* acme;
      assert.equal((yield* auth.status).auth._tag, "SignedOut");
      assert.equal((yield* Effect.flip(auth.accessToken)).reason, "sign_in_required");
    }).pipe(Effect.provide(accountsWith({ requests: [], tokenReplies: [] }, memorySecrets()))),
  );

  it.effect(
    "device code: shows the code, polls until the issuer grants, then holds the refresh token",
    () => {
      const fake: IssuerFake = {
        requests: [],
        tokenReplies: [
          { status: 400, body: { error: "authorization_pending" } },
          {
            status: 200,
            body: { access_token: accessTokenFor("PJ"), refresh_token: "rt-1", expires_in: 3600 },
          },
        ],
      };
      const secrets = memorySecrets();
      return Effect.gen(function* () {
        const auth = yield* acme;
        const started = yield* auth.signIn;
        assert.deepEqual(started.auth, {
          _tag: "SigningIn",
          userCode: "ABCD-EFGH",
          verificationUri: "https://id.example.test/device",
          expiresAtMs: 900_000,
        });
        const devicecode = fake.requests[0]!;
        assert.equal(
          devicecode.params.get("scope"),
          "api://acme-broker/access openid profile offline_access",
        );
        yield* TestClock.adjust(Duration.seconds(11));
        assert.deepEqual((yield* auth.status).auth, { _tag: "SignedIn", name: "PJ" });
        assert.equal(secrets.read(SECRET), "rt-1");
        assert.equal(yield* auth.accessToken, accessTokenFor("PJ"));
        assert.equal(
          fake.requests.filter((r) => r.path.endsWith("/token")).length,
          2,
          "the cached token is reused",
        );
      }).pipe(Effect.provide(accountsWith(fake, secrets)));
    },
  );

  it.effect("a browser that is already signed in finishes the sign-in without the code", () => {
    const fake: IssuerFake = {
      requests: [],
      tokenReplies: [
        {
          status: 200,
          body: {
            access_token: accessTokenFor("Pj"),
            refresh_token: "rt-browser",
            expires_in: 3600,
          },
        },
      ],
    };
    const secrets = memorySecrets();
    // Stands in for a browser with a live session at the issuer: it follows the authorize URL straight
    // to its redirect, carrying a code — over the real loopback listener.
    const opened: Array<URL> = [];
    const signedInBrowser = Layer.mock(ExternalLauncher.ExternalLauncher)({
      launchBrowser: (target) =>
        Effect.sync(() => {
          const authorize = new URL(target);
          opened.push(authorize);
          const redirect = new URL(authorize.searchParams.get("redirect_uri") ?? "");
          redirect.searchParams.set("code", "auth-code-1");
          redirect.searchParams.set("state", authorize.searchParams.get("state") ?? "");
          // @effect-diagnostics-next-line globalTimersInEffect:off globalFetch:off - The fake browser makes a real HTTP request to the loopback listener, after the launch returns.
          setTimeout(() => void fetch(redirect).catch(() => {}), 10);
        }),
    });
    // @effect-diagnostics-next-line globalTimers:off - Real time: the loopback round trip is real I/O, not TestClock time.
    const realWait = (ms: number) => Effect.promise(() => new Promise((r) => setTimeout(r, ms)));
    return Effect.gen(function* () {
      const auth = yield* acme;
      yield* auth.signIn;
      for (let i = 0; i < 100 && (yield* auth.status).auth._tag !== "SignedIn"; i++) {
        yield* realWait(20);
      }
      assert.deepEqual((yield* auth.status).auth, { _tag: "SignedIn", name: "Pj" });
      assert.equal(secrets.read(SECRET), "rt-browser");
      const authorize = opened[0];
      assert.equal(authorize?.searchParams.get("code_challenge_method"), "S256");
      assert.match(authorize?.searchParams.get("redirect_uri") ?? "", /^http:\/\/localhost:\d+$/);
      const exchange = fake.requests.find(
        (r) => r.params.get("grant_type") === "authorization_code",
      );
      assert.equal(exchange?.params.get("code"), "auth-code-1");
      assert.equal(
        exchange?.params.get("redirect_uri"),
        authorize?.searchParams.get("redirect_uri"),
      );
      assert.isTrue((exchange?.params.get("code_verifier") ?? "").length >= 43);
      // The device code never had to be used.
      assert.isFalse(
        fake.requests.some((r) => r.params.get("grant_type")?.endsWith("device_code")),
      );
    }).pipe(Effect.provide(accountsWith(fake, secrets, signedInBrowser)));
  });

  it.effect("a sign-in declined in the browser is shown, and the code still works", () => {
    const fake: IssuerFake = {
      requests: [],
      tokenReplies: [{ status: 400, body: { error: "authorization_pending" } }],
    };
    let page = "";
    const decliningBrowser = Layer.mock(ExternalLauncher.ExternalLauncher)({
      launchBrowser: (target) =>
        Effect.sync(() => {
          const authorize = new URL(target);
          const redirect = new URL(authorize.searchParams.get("redirect_uri") ?? "");
          redirect.searchParams.set("error", "access_denied");
          redirect.searchParams.set("error_description", "The user declined.");
          redirect.searchParams.set("state", authorize.searchParams.get("state") ?? "");
          // @effect-diagnostics-next-line globalTimersInEffect:off globalFetch:off - The fake browser makes a real HTTP request to the loopback listener, after the launch returns.
          setTimeout(() => void fetch(redirect).then(async (r) => (page = await r.text())), 10);
        }),
    });
    // @effect-diagnostics-next-line globalTimers:off - Real time: the loopback round trip is real I/O, not TestClock time.
    const realWait = (ms: number) => Effect.promise(() => new Promise((r) => setTimeout(r, ms)));
    return Effect.gen(function* () {
      const auth = yield* acme;
      yield* auth.signIn;
      for (let i = 0; i < 100 && (yield* auth.status).lastError === null; i++) yield* realWait(20);
      const status = yield* auth.status;
      assert.equal(status.lastError, "The user declined.");
      assert.equal(status.auth._tag, "SigningIn");
      assert.include(page, "did not finish");
      assert.notInclude(page, "You're signed in");
    }).pipe(Effect.provide(accountsWith(fake, memorySecrets(), decliningBrowser)));
  });

  it.effect("an expired code ends the sign-in with a reason the user can act on", () =>
    Effect.gen(function* () {
      const auth = yield* acme;
      yield* auth.signIn;
      yield* TestClock.adjust(Duration.seconds(6));
      const status = yield* auth.status;
      assert.equal(status.auth._tag, "SignedOut");
      assert.equal(status.lastError, "The sign-in code expired. Start again.");
    }).pipe(
      Effect.provide(
        accountsWith(
          { requests: [], tokenReplies: [{ status: 400, body: { error: "expired_token" } }] },
          memorySecrets(),
        ),
      ),
    ),
  );

  it.effect("refreshes with the stored token and keeps the rotated one", () => {
    const fake: IssuerFake = {
      requests: [],
      tokenReplies: [
        {
          status: 200,
          body: { access_token: accessTokenFor("PJ"), refresh_token: "rt-2", expires_in: 3600 },
        },
      ],
    };
    const secrets = memorySecrets({ [SECRET]: "rt-1" });
    return Effect.gen(function* () {
      const auth = yield* acme;
      assert.equal(yield* auth.accessToken, accessTokenFor("PJ"));
      const refresh = fake.requests.at(-1)!;
      assert.equal(refresh.params.get("grant_type"), "refresh_token");
      assert.equal(refresh.params.get("refresh_token"), "rt-1");
      assert.equal(secrets.read(SECRET), "rt-2");
    }).pipe(Effect.provide(accountsWith(fake, secrets)));
  });

  it.effect(
    "a revoked refresh token self-heals into 'sign in again' and forgets the dead token",
    () => {
      const secrets = memorySecrets({ [SECRET]: "rt-dead" });
      return Effect.gen(function* () {
        const auth = yield* acme;
        const failure = yield* Effect.flip(auth.accessToken);
        assert.equal(failure.reason, "sign_in_required");
        assert.equal(secrets.read(SECRET), undefined);
        assert.equal((yield* auth.status).auth._tag, "SignedOut");
      }).pipe(
        Effect.provide(
          accountsWith(
            { requests: [], tokenReplies: [{ status: 400, body: { error: "invalid_grant" } }] },
            secrets,
          ),
        ),
      );
    },
  );

  it.effect("sign-out forgets the refresh token", () => {
    const secrets = memorySecrets({ [SECRET]: "rt-1" });
    return Effect.gen(function* () {
      const auth = yield* acme;
      assert.equal((yield* auth.status).auth._tag, "SignedIn");
      yield* auth.signOut;
      assert.equal(secrets.read(SECRET), undefined);
      assert.equal((yield* auth.status).auth._tag, "SignedOut");
    }).pipe(Effect.provide(accountsWith({ requests: [], tokenReplies: [] }, secrets)));
  });
  it.effect(
    "sign-out during a pending code: approving that old code later does not sign back in",
    () => {
      const fake: IssuerFake = {
        requests: [],
        tokenReplies: [
          { status: 400, body: { error: "authorization_pending" } },
          {
            status: 200,
            body: {
              access_token: accessTokenFor("PJ"),
              refresh_token: "rt-late",
              expires_in: 3600,
            },
          },
        ],
      };
      const secrets = memorySecrets();
      return Effect.gen(function* () {
        const auth = yield* acme;
        yield* auth.signIn;
        yield* auth.signOut;
        assert.equal((yield* auth.status).auth._tag, "SignedOut");
        yield* TestClock.adjust(Duration.seconds(30));
        assert.equal((yield* auth.status).auth._tag, "SignedOut");
        assert.equal(secrets.read(SECRET), undefined, "the late approval stored nothing");
      }).pipe(Effect.provide(accountsWith(fake, secrets)));
    },
  );

  it.effect(
    "concurrent token requests share one refresh (a rotating token is never spent twice)",
    () => {
      const fake: IssuerFake = {
        requests: [],
        tokenReplies: [
          {
            status: 200,
            body: { access_token: accessTokenFor("PJ"), refresh_token: "rt-2", expires_in: 3600 },
          },
          { status: 400, body: { error: "invalid_grant" } },
        ],
      };
      const secrets = memorySecrets({ [SECRET]: "rt-1" });
      return Effect.gen(function* () {
        const auth = yield* acme;
        const tokens = yield* Effect.all([auth.accessToken, auth.accessToken, auth.accessToken], {
          concurrency: "unbounded",
        });
        assert.deepEqual(tokens, [
          accessTokenFor("PJ"),
          accessTokenFor("PJ"),
          accessTokenFor("PJ"),
        ]);
        assert.equal(fake.requests.filter((r) => r.path.endsWith("/token")).length, 1);
        assert.equal(secrets.read(SECRET), "rt-2", "still signed in with the rotated token");
      }).pipe(Effect.provide(accountsWith(fake, secrets)));
    },
  );

  it.effect("one sign-in serves every resource: each is redeemed with its own scope", () => {
    const fake: IssuerFake = {
      requests: [],
      tokenReplies: [
        {
          status: 200,
          body: { access_token: accessTokenFor("PJ"), refresh_token: "rt-2", expires_in: 3600 },
        },
      ],
    };
    const secrets = memorySecrets({ [SECRET]: "rt-1" });
    return Effect.gen(function* () {
      const auth = yield* acme;
      yield* auth.accessTokenFor("knowledge");
      assert.equal(
        fake.requests.at(-1)?.params.get("scope"),
        "api://acme-knowledge/read openid profile offline_access",
      );
      const unknown = yield* Effect.flip(auth.accessTokenFor("payroll"));
      assert.equal(unknown.reason, "unavailable");
    }).pipe(Effect.provide(accountsWith(fake, secrets)));
  });

  it.effect("an issuer without a device code signs in through the browser alone", () => {
    const fake: IssuerFake = { requests: [], tokenReplies: [] };
    const { deviceAuthorizationEndpoint: _, ...issuer } = ACME.issuer;
    return Effect.gen(function* () {
      const auth = yield* acme;
      const started = yield* auth.signIn;
      assert.equal(started.auth._tag, "SigningIn");
      assert.deepEqual(
        started.auth._tag === "SigningIn"
          ? [started.auth.userCode, started.auth.verificationUri]
          : [],
        [null, null],
      );
      assert.isFalse(fake.requests.some((r) => r.path.endsWith("/devicecode")));
    }).pipe(Effect.provide(accountsWith(fake, memorySecrets(), noBrowser, [{ ...ACME, issuer }])));
  });
});
