import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Accounts } from "./account/t3team-Accounts.ts";
import { EnvironmentAuth } from "./auth/EnvironmentAuth.ts";
import { ServerConfig } from "./config.ts";
import { HostServices, layerForHostServices } from "./t3team-hostServices.ts";

it.effect(
  "pack services start once after receiving the listening port and stop with the server",
  () => {
    const events: string[] = [];
    const layer = layerForHostServices([
      {
        id: "acme.devices",
        async start(context) {
          assert.match(context.stateDirectory, /userdata$/);
          events.push(`start:${context.localOrigin}`);
          return {
            request: async (method, path, body, caller) => ({ method, path, body, caller }),
            close: () => {
              events.push("stop");
            },
          };
        },
      },
    ]).pipe(
      Layer.provide(
        Layer.mergeAll(
          ServerConfig.layerTest(process.cwd(), { prefix: "host-services-test-" }),
          Layer.mock(Accounts)({}),
          Layer.mock(EnvironmentAuth)({}),
        ),
      ),
      Layer.provide(NodeServices.layer),
    );
    return Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const services = yield* HostServices;
        yield* services.start(3773);
        yield* services.start(3773);
        assert.deepEqual(
          yield* services.request(
            "acme.devices",
            "POST",
            "enable",
            { enabled: true },
            { desktop: false },
          ),
          { method: "POST", path: "enable", body: { enabled: true }, caller: { desktop: false } },
        );
        assert.deepEqual(yield* services.request("acme.devices", "GET", "status", undefined), {
          method: "GET",
          path: "status",
          body: undefined,
          caller: undefined,
        });
        assert.equal(
          yield* services.request("other", "GET", "status", undefined).pipe(
            Effect.match({
              onFailure: (error) => error.message,
              onSuccess: () => "unexpected success",
            }),
          ),
          "Host service is unavailable",
        );
        assert.deepEqual(events, ["start:http://127.0.0.1:3773"]);
      }).pipe(Effect.provide(layer), Effect.scoped);
      assert.deepEqual(events, ["start:http://127.0.0.1:3773", "stop"]);
    });
  },
);

it.effect("an unconfigured host starts no services and issues no local credential", () =>
  Effect.gen(function* () {
    const services = yield* HostServices;
    yield* services.start(3773);
    assert.equal(
      yield* services.request("missing", "GET", "status", undefined).pipe(
        Effect.match({
          onFailure: (error) => error.message,
          onSuccess: () => "unexpected success",
        }),
      ),
      "Host service is unavailable",
    );
  }).pipe(
    Effect.provide(
      layerForHostServices([]).pipe(
        Layer.provide(
          Layer.mergeAll(
            ServerConfig.layerTest(process.cwd(), { prefix: "host-services-test-" }),
            Layer.mock(Accounts)({}),
            Layer.mock(EnvironmentAuth)({}),
          ),
        ),
        Layer.provide(NodeServices.layer),
      ),
    ),
    Effect.scoped,
  ),
);
