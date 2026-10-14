import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

import { loadBrokerDeviceList } from "./t3team-brokerDeviceList";
import { makeMockBroker } from "./t3team-mockBroker.fixtures";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const HOSTS = [
  { id: "old-box", label: "Grok box", online: false, lastSeen: "2026-10-01T08:00:00Z" },
  { id: "mac", label: "MacBook", online: true, lastSeen: "2026-10-14T07:00:00Z" },
];
const SESSIONS = [
  { runId: "41", environmentId: "env-a", label: "nx-nexi", since: "2026-10-14T06:00:00Z" },
  { runId: "42", since: "2026-10-14T07:30:00Z" },
];

describe("the user's devices from the broker", () => {
  it.live("asks for sign-in before the account is signed in", () =>
    Effect.gen(function* () {
      const { broker, state } = yield* makeMockBroker({ hosts: HOSTS });
      const result = yield* loadBrokerDeviceList(Option.some(broker));
      expect(result._tag).toBe("SignInRequired");
      expect(state.calls).toEqual([]);
    }),
  );

  it.live("lists online machines first, then offline ones, then cloud sessions", () =>
    Effect.gen(function* () {
      const { broker, signIn, state } = yield* makeMockBroker({
        hosts: HOSTS,
        sessions: SESSIONS,
      });
      yield* signIn;
      const result = yield* loadBrokerDeviceList(Option.some(broker));

      expect(result).toEqual({
        _tag: "Loaded",
        devices: [
          {
            key: "h-mac",
            kind: "machine",
            label: "MacBook",
            online: true,
            seenAt: "2026-10-14T07:00:00Z",
            environmentId: null,
          },
          {
            key: "h-old-box",
            kind: "machine",
            label: "Grok box",
            online: false,
            seenAt: "2026-10-01T08:00:00Z",
            environmentId: null,
          },
          {
            key: "42",
            kind: "cloudSession",
            label: "Cloud session",
            online: true,
            seenAt: "2026-10-14T07:30:00Z",
            environmentId: null,
          },
          {
            key: "41",
            kind: "cloudSession",
            label: "nx-nexi",
            online: true,
            seenAt: "2026-10-14T06:00:00Z",
            environmentId: "env-a",
          },
        ],
      });
      expect(state.calls.every((call) => call.bearer?.split(".").length === 3)).toBe(true);
    }),
  );

  it.live("shows cloud sessions alone when the broker has machines switched off", () =>
    Effect.gen(function* () {
      const { broker, signIn } = yield* makeMockBroker({
        hostsEnabled: false,
        hosts: HOSTS,
        sessions: SESSIONS.slice(0, 1),
      });
      yield* signIn;
      const result = yield* loadBrokerDeviceList(Option.some(broker));
      expect(result._tag === "Loaded" && result.devices.map((device) => device.key)).toEqual([
        "41",
      ]);
    }),
  );

  it.effect("is unavailable in a build without a broker", () =>
    Effect.gen(function* () {
      expect(yield* loadBrokerDeviceList(Option.none())).toEqual({ _tag: "Unavailable" });
    }),
  );
});
