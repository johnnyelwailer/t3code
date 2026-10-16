import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

import { makeMockBroker } from "./t3team-mockBroker.fixtures";
import { startBrokerCloudSession } from "./t3team-startBrokerCloudSession";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

describe("startBrokerCloudSession", () => {
  it.live("starts a session with only the phone's sign-in, no machine involved", () =>
    Effect.gen(function* () {
      const { broker, signIn, state } = yield* makeMockBroker({ sessionStart: "ok" });
      yield* signIn;

      const runId = yield* startBrokerCloudSession(Option.some(broker));

      expect(runId).toBe("run-started");
      expect(state.calls.map((call) => `${call.method} ${call.path}`)).toContain(
        "POST /v1/sessions",
      );
    }),
  );

  it.live("says plainly when the broker cannot start sessions on its own yet", () =>
    Effect.gen(function* () {
      const { broker, signIn } = yield* makeMockBroker();
      yield* signIn;

      const failure = yield* Effect.flip(startBrokerCloudSession(Option.some(broker)));

      expect(failure.reason).toBe("broker_unavailable");
      expect(failure.message).toBe("The Nexi broker cannot start cloud sessions on its own yet.");
    }),
  );

  it.live("tells the user to wait when too many of their sessions are starting", () =>
    Effect.gen(function* () {
      const { broker, signIn } = yield* makeMockBroker({ sessionStart: "busy" });
      yield* signIn;

      const failure = yield* Effect.flip(startBrokerCloudSession(Option.some(broker)));

      expect(failure.message).toContain("Try again shortly");
    }),
  );

  it.live("asks to sign in when the broker does not accept the sign-in", () =>
    Effect.gen(function* () {
      const { broker } = yield* makeMockBroker({ sessionStart: "ok" });

      const failure = yield* Effect.flip(startBrokerCloudSession(Option.some(broker)));

      expect(failure.reason).toBe("broker_sign_in_required");
    }),
  );

  it.effect("reports a build without a broker as not set up", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(startBrokerCloudSession(Option.none()));

      expect(failure.message).toBe("Cloud sessions are not set up in this build.");
    }),
  );
});
