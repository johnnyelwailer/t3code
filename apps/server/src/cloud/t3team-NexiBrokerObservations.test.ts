import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { Accounts } from "../account/t3team-Accounts.ts";
import { setPackAccounts } from "../account/t3team-packAccounts.ts";
import type { BrokerSession } from "./t3team-NexiBrokerClient.ts";
import { NexiBrokerService, layer } from "./t3team-NexiBrokerService.ts";

function fixture() {
  let sessions: ReadonlyArray<BrokerSession> = [];
  let unavailable = false;
  let wall = 0;
  let elapsed = 0n;
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => wall,
    currentTimeMillis: Effect.sync(() => wall),
    currentTimeNanosUnsafe: () => BigInt(wall) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(wall) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => elapsed,
    monotonicTimeNanos: Effect.sync(() => elapsed),
    sleep: () => Effect.void,
  };
  const http = HttpClient.make((request) =>
    Effect.sync(() =>
      HttpClientResponse.fromWeb(
        request,
        Response.json({ sessions }, { status: unavailable ? 503 : 200 }),
      ),
    ),
  );
  const provide = <A, E>(effect: Effect.Effect<A, E, NexiBrokerService>) =>
    Effect.gen(function* () {
      setPackAccounts([
        {
          id: "test",
          label: "Test",
          issuer: {
            clientId: "test",
            authorizationEndpoint: "https://test/authorize",
            tokenEndpoint: "https://test/token",
          },
          baseScopes: "openid",
          resources: { broker: "broker" },
          signInResource: "broker",
        },
      ]);
      yield* Effect.addFinalizer(() => Effect.sync(() => setPackAccounts([])));
      return yield* effect.pipe(
        Effect.provide(layer),
        Effect.provideService(
          Accounts,
          Accounts.of({
            list: Effect.succeed([]),
            signIn: () => Effect.die("unused"),
            signOut: () => Effect.void,
            accessToken: () => Effect.succeed("test"),
          }),
        ),
        Effect.provideService(HttpClient.HttpClient, http),
        Effect.provideService(Clock.Clock, clock),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: { T3CODE_NEXI_BROKER_URL: "https://broker.test", NEXI_FF_CLOUD_BROKER: "on" },
            }),
          ),
        ),
      );
    }).pipe(Effect.scoped);
  return {
    provide,
    unavailable: (value: boolean) => {
      unavailable = value;
    },
    list: (value: ReadonlyArray<BrokerSession>) => {
      sessions = value;
    },
    time: (elapsedMs: number, wallMs = elapsedMs) => {
      elapsed = BigInt(elapsedMs) * 1_000_000n;
      wall = wallMs;
    },
  };
}
const starting = [{ runId: "200", environmentId: null }];
const input = { sessionId: "200" };
const reason = (broker: NexiBrokerService["Service"], request = input) =>
  broker
    .attach(request)
    .pipe(Effect.match({ onFailure: (error) => error.reason, onSuccess: () => "attached" }));

describe("broker list observations", () => {
  it.effect(
    "keeps a one-second outage retryable after six minutes listed without an environment",
    () => {
      const f = fixture();
      return f.provide(
        Effect.gen(function* () {
          const broker = yield* NexiBrokerService;
          f.list(starting);
          expect(yield* reason(broker)).toBe("unknown_session");
          f.time(360_000);
          expect(yield* reason(broker)).toBe("unknown_session");
          f.time(361_000);
          f.list([]);
          expect(yield* reason(broker)).toBe("unknown_session");
        }),
      );
    },
  );

  it.effect("a public sessions read resets absence even without a successful attach", () => {
    const f = fixture();
    return f.provide(
      Effect.gen(function* () {
        const broker = yield* NexiBrokerService;
        expect(yield* reason(broker)).toBe("unknown_session");
        f.time(240_000);
        f.list(starting);
        expect(yield* broker.sessions).toEqual(starting);
        f.time(360_000);
        f.list([]);
        expect(yield* reason(broker)).toBe("unknown_session");
        f.time(660_000);
        expect(yield* reason(broker)).toBe("session_ended");
      }),
    );
  });

  it.effect("public missing lists start absence before the first attach", () => {
    const f = fixture();
    return f.provide(
      Effect.gen(function* () {
        const broker = yield* NexiBrokerService;
        f.list(starting);
        yield* broker.sessions;
        f.list([]);
        yield* broker.sessions;
        f.time(300_000);
        expect(yield* reason(broker)).toBe("session_ended");
      }),
    );
  });

  it.effect("ignores a forward wall-clock correction during a one-second outage", () => {
    const f = fixture();
    return f.provide(
      Effect.gen(function* () {
        const broker = yield* NexiBrokerService;
        expect(yield* reason(broker)).toBe("unknown_session");
        f.time(1_000, 360_000);
        expect(yield* reason(broker)).toBe("unknown_session");
      }),
    );
  });

  it.effect("ends continuous absence despite a backward wall-clock correction", () => {
    const f = fixture();
    return f.provide(
      Effect.gen(function* () {
        const broker = yield* NexiBrokerService;
        expect(yield* reason(broker)).toBe("unknown_session");
        f.time(300_000, -360_000);
        expect(yield* reason(broker)).toBe("session_ended");
      }),
    );
  });

  it.effect("does not apply a known deadline without a healthy missing list", () => {
    const f = fixture();
    f.time(0, 360_000);
    return f.provide(
      Effect.gen(function* () {
        const broker = yield* NexiBrokerService;
        const expired = { ...input, endsAt: "1970-01-01T00:05:00.000Z" };
        f.unavailable(true);
        expect(yield* reason(broker, expired)).toBe("broker_unavailable");
        f.unavailable(false);
        const future = { ...input, endsAt: "1970-01-01T00:10:00.000Z" };
        expect(yield* reason(broker, future)).toBe("unknown_session");
        f.time(300_000, 360_000);
        expect(yield* reason(broker, future)).toBe("session_ended");
      }),
    );
  });

  it.effect(
    "requires a minute of healthy absence even past a real hold deadline after a restart",
    () => {
      const f = fixture();
      f.time(0, 360_000);
      return f.provide(
        Effect.gen(function* () {
          const broker = yield* NexiBrokerService;
          const expired = { ...input, endsAt: "1970-01-01T00:05:00.000Z" };
          expect(yield* reason(broker, expired)).toBe("unknown_session");
          f.time(59_999, 419_999);
          expect(yield* reason(broker, expired)).toBe("unknown_session");
          f.time(60_000, 420_000);
          expect(yield* reason(broker, expired)).toBe("session_ended");
          f.list(starting);
          expect(yield* reason(broker, expired)).toBe("unknown_session");
        }),
      );
    },
  );
});
