import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpServer from "effect/http/HttpServer";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as HostProcess from "@t3tools/shared/HostProcess";

import * as ServerConfig from "../config.ts";
import * as AnalyticsService from "./AnalyticsService.ts";
import { telemetryEnabledConfig } from "./t3team-telemetryDefault.ts";

const resolveEnabled = (env: Record<string, unknown>) =>
  Effect.gen(function* () {
    return yield* telemetryEnabledConfig;
  }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))));

/** Starts the real AnalyticsService under `env`, records one event, flushes, and returns the paths the ingest saw. */
const requestsSentUnder = (env: Record<string, unknown>) =>
  Effect.gen(function* () {
    const capturedPaths: Array<string> = [];
    const layerServerConfig = ServerConfig.ServerConfig.layerTest(process.cwd(), {
      prefix: "t3team-telemetry-default-",
    });
    const layerBatchServer = HttpServer.serve(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        capturedPaths.push(request.url);
        return HttpServerResponse.jsonUnsafe({});
      }),
    );
    const layerRuntime = AnalyticsService.layer.pipe(
      Layer.provideMerge(layerServerConfig),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(HostProcess.Platform, "linux"),
          Layer.succeed(HostProcess.Architecture, "arm64"),
        ),
      ),
      Layer.provideMerge(NodeHttpServer.layerTest),
    );

    yield* Effect.gen(function* () {
      yield* Layer.launch(layerBatchServer).pipe(Effect.forkScoped);
      const analytics = yield* AnalyticsService.AnalyticsService;
      yield* analytics.record("test.default", { index: 1 });
      yield* analytics.flush;
    }).pipe(Effect.provide(layerRuntime));

    return capturedPaths;
  });

it.layer(NodeServices.layer)("telemetry default", (it) => {
  it.effect("usage telemetry is off when nothing is configured", () =>
    Effect.gen(function* () {
      assert.equal(yield* resolveEnabled({}), false);
      assert.deepEqual(yield* requestsSentUnder({}), []);
    }),
  );

  it.effect("an explicit T3CODE_TELEMETRY_ENABLED=true turns it on", () =>
    Effect.gen(function* () {
      assert.equal(yield* resolveEnabled({ T3CODE_TELEMETRY_ENABLED: "true" }), true);
      const sent = yield* requestsSentUnder({ T3CODE_TELEMETRY_ENABLED: true });
      assert.equal(sent.length > 0, true);
    }),
  );

  it.effect("an own host and key together turn it on when the flag is unset", () =>
    Effect.gen(function* () {
      const env = {
        T3CODE_POSTHOG_HOST: "https://ingest.example.test",
        T3CODE_POSTHOG_KEY: "phc_test_key",
      };
      assert.equal(yield* resolveEnabled(env), true);
      assert.equal((yield* requestsSentUnder(env)).length > 0, true);
    }),
  );

  it.effect("a host alone, a key alone or blank values stay off", () =>
    Effect.gen(function* () {
      const host = { T3CODE_POSTHOG_HOST: "https://ingest.example.test" };
      const key = { T3CODE_POSTHOG_KEY: "phc_test_key" };
      assert.equal(yield* resolveEnabled(host), false);
      assert.equal(yield* resolveEnabled(key), false);
      assert.equal(
        yield* resolveEnabled({ T3CODE_POSTHOG_HOST: "  ", T3CODE_POSTHOG_KEY: "  " }),
        false,
      );
      assert.deepEqual(yield* requestsSentUnder(host), []);
    }),
  );

  it.effect("an explicit T3CODE_TELEMETRY_ENABLED=false beats an own host and key", () =>
    Effect.gen(function* () {
      const env = {
        T3CODE_TELEMETRY_ENABLED: "false",
        T3CODE_POSTHOG_HOST: "https://ingest.example.test",
        T3CODE_POSTHOG_KEY: "phc_test_key",
      };
      assert.equal(yield* resolveEnabled(env), false);
      assert.deepEqual(yield* requestsSentUnder(env), []);
    }),
  );

  it.effect("a malformed T3CODE_TELEMETRY_ENABLED is a config error, not a silent default", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(resolveEnabled({ T3CODE_TELEMETRY_ENABLED: "maybe" }));
      assert.equal(result._tag, "Failure");
    }),
  );
});
