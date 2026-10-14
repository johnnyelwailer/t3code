import { describe, expect, it } from "@effect/vitest";
import { layerRemoteHttpClient } from "@t3tools/client-runtime/rpc";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as Option from "effect/Option";
import { afterEach, vi } from "vite-plus/test";

import { brokerProxyFetch, setBrokerProxyTokenSource } from "./t3team-brokerProxyTransport";
import { makeMobileBrokerGateway } from "./t3team-mobileBrokerGateway";
import { MOCK_BROKER, makeMockBroker } from "./t3team-mockBroker.fixtures";
import { makeMockBrokerProxy } from "./t3team-mockBrokerProxy.fixtures";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

afterEach(() => setBrokerProxyTokenSource(null));

const envA = EnvironmentId.make("env-a");

/** The app's gateway on the mock broker: real sign-in, real broker client, real transport seam. */
const setup = (options: { readonly proxyEnabled?: boolean } = {}) =>
  Effect.gen(function* () {
    const mock = yield* makeMockBroker({
      hosts: [
        { id: "mac", label: "MacBook", online: true },
        { id: "box", label: "Grok box", online: false },
      ],
      sessions: [
        { runId: "44", environmentId: "env-a" },
        { runId: "45", environmentId: "env-a" },
        { runId: "50" },
      ],
    });
    const proxy = makeMockBrokerProxy({
      acceptsToken: (token) => mock.issuer.issuedAccessTokens.has(token),
      enabled: options.proxyEnabled ?? true,
      devices: {
        "45": { environmentId: "env-a", label: "nx-nexi" },
        "h-mac": { environmentId: "env-mac", label: "MacBook" },
      },
    });
    const http = yield* HttpClient.HttpClient.pipe(
      Effect.provide(layerRemoteHttpClient(brokerProxyFetch(proxy.fetch, MOCK_BROKER))),
    );
    const gateway = makeMobileBrokerGateway({
      broker: Effect.succeed(Option.some(mock.broker)),
      http,
    });
    /** Signs in, then hands the seam the account's broker token, as the platform does. */
    const signIn = Effect.gen(function* () {
      yield* mock.signIn;
      const token = yield* mock.session.accessToken("broker");
      setBrokerProxyTokenSource(async () => token);
    });
    return { ...mock, proxy, gateway, signIn };
  });

describe("the phone's broker gateway", () => {
  it.live("blocks on sign-in until the Microsoft account is signed in", () =>
    Effect.gen(function* () {
      const { gateway } = yield* setup();
      const error = yield* Effect.flip(
        gateway.attach({ sessionId: "41", expectedEnvironmentId: envA }),
      );
      expect(error).toMatchObject({ _tag: "ConnectionBlockedError", reason: "authentication" });
    }),
  );

  it.live("follows an ended run to the newest one serving its environment, via the proxy", () =>
    Effect.gen(function* () {
      const { gateway, signIn, proxy } = yield* setup();
      yield* signIn;
      const attached = yield* gateway.attach({ sessionId: "41", expectedEnvironmentId: envA });

      expect(attached).toEqual({
        sessionId: "45",
        httpBaseUrl: "https://45.nexi-broker.invalid",
        wsBaseUrl: "wss://45.nexi-broker.invalid",
      });
      expect(proxy.state.requests).toHaveLength(1);
      const [probe] = proxy.state.requests;
      expect(probe?.url).toBe(`${MOCK_BROKER}/d/45/.well-known/t3/environment`);
      expect(probe?.authorization?.split(".")).toHaveLength(3);
      expect(probe?.credentials).toBe("omit");
    }),
  );

  it.live("reaches an online machine by its host key and refuses an offline one", () =>
    Effect.gen(function* () {
      const { gateway, signIn } = yield* setup();
      yield* signIn;
      const mac = yield* gateway.attach({
        sessionId: "h-mac",
        expectedEnvironmentId: EnvironmentId.make("env-mac"),
      });
      expect(mac.httpBaseUrl).toBe("https://h-mac.nexi-broker.invalid");

      const offline = yield* Effect.flip(
        gateway.attach({
          sessionId: "h-box",
          expectedEnvironmentId: EnvironmentId.make("env-box"),
        }),
      );
      expect(offline).toMatchObject({
        _tag: "ConnectionTransientError",
        detail: "Grok box is offline.",
      });
    }),
  );

  it.live("says why when the broker does not proxy for phones yet", () =>
    Effect.gen(function* () {
      const { gateway, signIn } = yield* setup({ proxyEnabled: false });
      yield* signIn;
      const error = yield* Effect.flip(
        gateway.attach({ sessionId: "45", expectedEnvironmentId: envA }),
      );
      expect(error).toMatchObject({ _tag: "ConnectionBlockedError", reason: "unsupported" });
    }),
  );

  it.live("refuses a session that now serves another environment, or is not running", () =>
    Effect.gen(function* () {
      const { gateway, signIn } = yield* setup();
      yield* signIn;
      const moved = yield* Effect.flip(
        gateway.attach({ sessionId: "h-mac", expectedEnvironmentId: envA }),
      );
      expect(moved).toMatchObject({ _tag: "ConnectionBlockedError", reason: "configuration" });

      const starting = yield* Effect.flip(
        gateway.attach({ sessionId: "50", expectedEnvironmentId: EnvironmentId.make("env-b") }),
      );
      expect(starting).toMatchObject({ _tag: "ConnectionTransientError" });
    }),
  );

  it.live("pairs with a one-time credential the broker mints for the attached session", () =>
    Effect.gen(function* () {
      const { gateway, signIn, state } = yield* setup();
      yield* signIn;
      expect(yield* gateway.pair({ sessionId: "45" })).toBe("pairing-45-1");
      expect(state.calls.at(-1)).toMatchObject({
        method: "POST",
        path: "/v1/sessions/45/pairing",
      });
    }),
  );
});
