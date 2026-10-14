/**
 * Unit tests for the capacity-window derivation
 * (`t3team-providerCapacityWindows.ts`): pool, today-aware reset display,
 * severity, sample keys, unavailable wording, hub accounts.
 */
import { assert, it } from "@effect/vitest";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  UsageLimitSourceId,
  type ServerProvider,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe } from "vite-plus/test";

import { capacityFromProvider, hubCapacityFromSources } from "./t3team-providerCapacityWindows.ts";

const NOW = DateTime.makeUnsafe("2026-10-12T08:00:00.000Z");

const window = (
  patch: Partial<ServerProviderUsageWindow> & { id: string },
): ServerProviderUsageWindow => ({
  kind: "session",
  label: "Session",
  usedPercent: 50,
  ...patch,
});

const provider = (
  patch: Partial<ServerProvider> & { instanceId: ProviderInstanceId },
): ServerProvider =>
  ({
    driver: ProviderDriverKind.make("claudeAgent"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-10-12T08:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...patch,
  }) as ServerProvider;

describe("capacityFromProvider", () => {
  it("grades windows, keys samples per instance, and dates resets that are not today", () => {
    const capacity = capacityFromProvider(
      provider({
        instanceId: ProviderInstanceId.make("claudeAgent"),
        usageLimits: {
          checkedAt: "2026-10-12T08:00:00.000Z",
          windows: [
            window({
              id: "five_hour",
              usedPercent: 100,
              resetsAt: "2026-10-12T09:30:00.000Z",
              windowDurationMins: 300,
            }),
            window({
              id: "seven_day",
              kind: "weekly",
              label: "Weekly",
              usedPercent: 82,
              resetsAt: "2026-10-19T06:00:00.000Z",
            }),
          ],
        },
      }),
      NOW,
    );
    assert.deepStrictEqual(
      capacity.windows.map((w) => [w.sampleKey, w.pool, w.resetsDisplay, w.severity]),
      [
        ["claudeAgent:five_hour", "Session (5h)", "09:30 UTC", "critical"],
        ["claudeAgent:seven_day", "Weekly", "2026-10-19 06:00 UTC", "warning"],
      ],
    );
    assert.equal(capacity.displayName, "claudeAgent");
    assert.equal(capacity.unavailable, undefined);
  });

  it("mirrors the tab's unavailable state instead of inventing one", () => {
    const capacity = capacityFromProvider(
      provider({
        instanceId: ProviderInstanceId.make("claudeAgent"),
        displayName: "Claude",
        usageLimits: {
          checkedAt: "2026-10-12T08:00:00.000Z",
          windows: [],
          unavailable: { reason: "unsupported" },
        },
      }),
      NOW,
    );
    assert.equal(capacity.displayName, "Claude");
    assert.equal(capacity.unavailable, "no usage windows (unsupported)");
  });
});

describe("hubCapacityFromSources", () => {
  it("carries hub accounts with per-account sample keys, and read errors", () => {
    const { accounts, errors } = hubCapacityFromSources(
      [
        {
          id: UsageLimitSourceId.make("cliproxy-hub"),
          kind: "cliproxy",
          label: "hub",
          checkedAt: "2026-10-12T08:00:00.000Z",
          accounts: [
            {
              id: "cursor-a@x.json",
              driver: ProviderDriverKind.make("cursor"),
              email: "a@x",
              usageLimits: {
                checkedAt: "2026-10-12T08:00:00.000Z",
                windows: [
                  window({ id: "cursor_models", label: "Cursor Models", windowDurationMins: 300 }),
                  window({ id: "other_models", kind: "other", label: "Other models" }),
                ],
              },
            },
          ],
        },
        {
          id: UsageLimitSourceId.make("cliproxy-broken"),
          kind: "cliproxy",
          label: "broken",
          checkedAt: "2026-10-12T08:00:00.000Z",
          accounts: [],
          error: "The hub did not answer in time.",
        },
      ],
      NOW,
    );
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0]!.subject, "cursor · a@x");
    assert.deepStrictEqual(
      accounts[0]!.windows.map((w) => [w.sampleKey, w.pool]),
      [
        ["hub:hub:cursor-a@x.json:cursor_models", "Cursor Models (5h)"],
        ["hub:hub:cursor-a@x.json:other_models", "Other models"],
      ],
    );
    assert.deepEqual(errors, [{ sourceLabel: "broken", error: "The hub did not answer in time." }]);
  });
});
