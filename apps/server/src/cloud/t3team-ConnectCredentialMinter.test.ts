import { readConnectAuthorizeRequest } from "@t3tools/shared/connectAuth";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Schedule from "effect/Schedule";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { FetchHttpClient } from "effect/unstable/http";

import * as ServerConfig from "../config.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ExternalLauncher from "../process/externalLauncher.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as ConnectCredentialMinter from "./t3team-ConnectCredentialMinter.ts";
import { isConnectCredentialMintError } from "./t3team-ConnectCredentialMintError.ts";

// Keep in sync with CLOUD_CLI_OAUTH_LOOPBACK_PORT in publicConfig.ts (module-private).
const LOOPBACK_PORT = 34338;

// pk_test_<base64 of "clerk.example.test$">
const TEST_ENV = {
  T3CODE_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS50ZXN0JA==",
  T3CODE_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_client_test",
  T3CODE_HOSTED_APP_URL: "https://hosted.example.test",
};

const provideTestEnv = Effect.provide(
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: TEST_ENV })),
);

const TestTokenResponseJson = Schema.fromJsonString(
  Schema.Struct({
    access_token: Schema.String,
    refresh_token: Schema.String,
    id_token: Schema.optional(Schema.String),
    expires_in: Schema.Number,
    token_type: Schema.String,
  }),
);
const encodeTestTokenResponse = Schema.encodeSync(TestTokenResponseJson);

// The shape the secret file on disk carries: raw JSON of the persisted token.
const StoredTokenJson = Schema.fromJsonString(
  Schema.Struct({
    accessToken: Schema.String,
    refreshToken: Schema.String,
    expiresAtEpochMs: Schema.Number,
    identity: Schema.optional(Schema.String),
  }),
);
const decodeStoredTokenJson = Schema.decodeUnknownOption(StoredTokenJson);

// A JWT whose payload claims { email: "theo@example.test" }.
const idTokenWithEmail = (() => {
  const header = Encoding.encodeBase64Url(JSON.stringify({ alg: "none" }));
  const payload = Encoding.encodeBase64Url(JSON.stringify({ email: "theo@example.test" }));
  return `${header}.${payload}.`;
})();

interface RecordedTokenRequest {
  readonly url: string;
  readonly params: URLSearchParams;
}

const makeTokenEndpointLayer = (requests: Array<RecordedTokenRequest>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        const body =
          request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";
        requests.push({ url: request.url, params: new URLSearchParams(body) });
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            encodeTestTokenResponse({
              access_token: "access-token-1",
              refresh_token: "refresh-token-1",
              id_token: idTokenWithEmail,
              expires_in: 3600,
              token_type: "bearer",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }),
    ),
  );

/**
 * Build one isolated state dir (the `layerTest` effect needs a file system, so
 * Node services are folded in), and hand back a plain layer that everything
 * else can ride without touching the disk again.
 */
const buildStateDirLayer = (prefix: string) =>
  Effect.map(
    ServerConfig.ServerConfig.pipe(
      Effect.provide(
        ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(NodeServices.layer)),
      ),
    ),
    (config) => Layer.succeed(ServerConfig.ServerConfig, config),
  ).pipe(Effect.orDie);

const makeMinterLayer = (
  requests: Array<RecordedTokenRequest>,
  launchBrowser: (url: string) => Effect.Effect<void, unknown>,
  configLayer: Layer.Layer<ServerConfig.ServerConfig, never, never>,
) => {
  const config = ConfigProvider.layer(ConfigProvider.fromEnv({ env: TEST_ENV }));
  const http = makeTokenEndpointLayer(requests);
  const secretsLayer = ServerSecretStore.layer.pipe(
    Layer.provide(configLayer),
    Layer.provide(NodeServices.layer),
  );
  const launcherMock = Layer.succeed(
    ExternalLauncher.ExternalLauncher,
    { launchBrowser } as never,
  );
  const cliLayer = CliTokenManager.layer.pipe(
    Layer.provide(secretsLayer),
    Layer.provide(http),
    Layer.provide(launcherMock),
    Layer.provide(NodeServices.layer),
    Layer.provide(config),
  );
  const minterLayer = Layer.effect(
    ConnectCredentialMinter.ConnectCredentialMinter,
    ConnectCredentialMinter.make,
  ).pipe(
    Layer.provide(cliLayer),
    Layer.provide(launcherMock),
    Layer.provide(NodeServices.layer),
    Layer.provide(http),
    Layer.provide(config),
  );
  // Every constituent is self-contained (requirements folded in via
  // provide), so the merge is a plain service union exposing the minter,
  // the CLI manager, the secret store, the state dir, and the disk —
  // everything the assertions inspect directly.
  return Layer.mergeAll(minterLayer, cliLayer, secretsLayer, configLayer, NodeServices.layer);
};

/** Simulates the hosted /connect page: it redirects the code to the loopback listener. */
const launchAndRedirect =
  (opened: Array<string>) =>
  (url: string): Effect.Effect<void, unknown> =>
    Effect.gen(function* () {
      opened.push(url);
      const request = readConnectAuthorizeRequest(new URL(url));
      assert.isNotNull(request);
      const target = `http://127.0.0.1:${LOOPBACK_PORT}/callback?code=clerk-code-123&state=${encodeURIComponent(
        request!.state,
      )}`;
      // The real browser redirect lands after the listener has bound; the
      // instant test fetch may not. These tests run under the live clock
      // (see TestClock.withLive at each call site), so a short lead time lets
      // the loopback listener bind before the first request; a bounded retry
      // then covers a slow host.
      yield* Effect.sleep(Duration.millis(50));
      yield* Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        yield* client.execute(HttpClientRequest.get(target));
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.retry(Schedule.recurs(200)),
      );
    });

describe("ConnectCredentialMinter", () => {
  it.effect("mints the credential through a real loopback round-trip and stores it", () =>
    Effect.gen(function* () {
      const requests: Array<RecordedTokenRequest> = [];
      const opened: Array<string> = [];
      const configLayer = yield* buildStateDirLayer("connect-minter-roundtrip-");
      const layer = makeMinterLayer(requests, launchAndRedirect(opened), configLayer);

      yield* Effect.service(ConnectCredentialMinter.ConnectCredentialMinter).pipe(
        Effect.flatMap((minter) => minter.mint()),
        Effect.provide(layer),
        // Real I/O round-trip: the lead-time sleep and the mint's bounded
        // wait must run on the live clock, not it.effect's fake TestClock.
        TestClock.withLive,
      );

      // The browser was opened to the hosted /connect page with a loopback request.
      assert.lengthOf(opened, 1);
      const authorizeUrl = new URL(opened[0]!);
      assert.equal(authorizeUrl.origin, "https://hosted.example.test");
      assert.equal(authorizeUrl.pathname, "/connect");
      const request = readConnectAuthorizeRequest(authorizeUrl);
      assert.isNotNull(request);
      assert.equal(request!.loopbackPort, LOOPBACK_PORT);

      // The exchange spoke to the connect token endpoint with the LOOPBACK
      // redirect_uri (not the hosted one) and a verifier matching the challenge.
      assert.lengthOf(requests, 1);
      const exchange = requests[0]!;
      assert.equal(exchange.url, "https://clerk.example.test/oauth/token");
      assert.equal(exchange.params.get("grant_type"), "authorization_code");
      assert.equal(exchange.params.get("code"), "clerk-code-123");
      assert.equal(exchange.params.get("redirect_uri"), `http://127.0.0.1:${LOOPBACK_PORT}/callback`);
      assert.equal(exchange.params.get("client_id"), "oauth_client_test");
      assert.isNotNull(exchange.params.get("code_verifier"));

      // The credential is stored in the SAME secret the CLI flow writes:
      // 0600 permissions, the full refresh-capable credential.
      const serverConfig = yield* ServerConfig.ServerConfig.pipe(Effect.provide(configLayer));
      const secretPath = `${serverConfig.secretsDir}/cloud-cli-oauth-token.bin`;
      const fs = yield* FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer));
      const stat = yield* fs.stat(secretPath);
      // stat.mode carries the file-type bits too; mask to the permission bits.
      assert.equal(stat.mode & 0o777, 0o600);
      const raw = yield* fs.readFileString(secretPath);
      const stored = decodeStoredTokenJson(raw);
      const token = Option.match(stored, {
        onSome: (value) => value,
        onNone: () => null,
      });
      assert.isNotNull(token);
      assert.equal(token.accessToken, "access-token-1");
      assert.equal(token.refreshToken, "refresh-token-1");
      assert.equal(token.identity, "theo@example.test");
      assert.isNumber(token.expiresAtEpochMs);

      // The CLI manager now reads it back as a usable credential — the very
      // check the cloud-session handoff performs.
      const existing = yield* Effect.service(CliTokenManager.CloudCliTokenManager).pipe(
        Effect.flatMap((cli) => cli.getExisting),
        Effect.provide(layer),
      );
      assert.isTrue(Option.isSome(existing));
    }).pipe(provideTestEnv),
  );

  it.effect("fails with browser_callback_timeout when the user never confirms in the browser", () =>
    Effect.gen(function* () {
      const requests: Array<RecordedTokenRequest> = [];
      const opened: Array<string> = [];
      const configLayer = yield* buildStateDirLayer("connect-minter-timeout-");
      const layer = makeMinterLayer(
        requests,
        (url) => Effect.sync(() => opened.push(url)),
        configLayer,
      );

      const mintError = yield* Effect.service(ConnectCredentialMinter.ConnectCredentialMinter).pipe(
        Effect.flatMap((minter) => minter.mint({ timeout: Duration.millis(300) })),
        Effect.provide(layer),
        Effect.flip,
        // it.effect installs a fake TestClock that never elapses on its own;
        // run this mint with the live clock so the 300 ms bound is a real
        // wall-clock deadline, exactly like in production.
        TestClock.withLive,
      );

      assert.isTrue(isConnectCredentialMintError(mintError));
      if (isConnectCredentialMintError(mintError)) {
        assert.equal(mintError.reason, "browser_callback_timeout");
      }
      assert.lengthOf(opened, 1);
      // No token exchange happened.
      assert.lengthOf(requests, 0);
    }).pipe(provideTestEnv),
  );

  it.effect("concurrent mints share one browser round-trip", () =>
    Effect.gen(function* () {
      const requests: Array<RecordedTokenRequest> = [];
      const opened: Array<string> = [];
      const configLayer = yield* buildStateDirLayer("connect-minter-concurrent-");
      const layer = makeMinterLayer(requests, launchAndRedirect(opened), configLayer);

      yield* Effect.service(ConnectCredentialMinter.ConnectCredentialMinter).pipe(
        Effect.flatMap((minter) => Effect.all([minter.mint(), minter.mint()], { concurrency: 2 })),
        Effect.provide(layer),
        // The originator's real-I/O round-trip needs the live clock (lead-time
        // sleep); the joiner rides its deferred.
        TestClock.withLive,
      );

      // One sign-in, one exchange — the second mint rode the first.
      assert.lengthOf(opened, 1);
      assert.lengthOf(requests, 1);
    }).pipe(provideTestEnv),
  );

  it.effect("succeeds without a browser when a usable credential is already stored", () =>
    Effect.gen(function* () {
      const requests: Array<RecordedTokenRequest> = [];
      const opened: Array<string> = [];
      const configLayer = yield* buildStateDirLayer("connect-minter-seeded-");

      // Seed the secret the way a previous mint would have: the store holds
      // the JSON credential as bytes.
      yield* ServerSecretStore.ServerSecretStore.pipe(
        Effect.flatMap((secrets) =>
          secrets.set(
            "cloud-cli-oauth-token",
            new TextEncoder().encode(
              Schema.encodeSync(StoredTokenJson)({
                accessToken: "access-token-seed",
                refreshToken: "refresh-token-seed",
                expiresAtEpochMs: Date.now() + 3_600_000,
              }),
            ),
          ),
        ),
        Effect.provide(
          ServerSecretStore.layer.pipe(
            Layer.provide(configLayer),
            Layer.provide(NodeServices.layer),
          ),
        ),
      );

      const layer = makeMinterLayer(
        requests,
        (url) => Effect.sync(() => opened.push(url)),
        configLayer,
      );
      yield* Effect.service(ConnectCredentialMinter.ConnectCredentialMinter).pipe(
        Effect.flatMap((minter) => minter.mint()),
        Effect.provide(layer),
      );

      // No browser, no exchange: the stored credential short-circuited.
      assert.lengthOf(opened, 0);
      assert.lengthOf(requests, 0);
    }).pipe(provideTestEnv),
  );
});
