/**
 * Hub-mirror dedupe (`t3team-providerCapacityDedupe.ts`): a hub window with the
 * same pool, kind, and reset as a live window is dropped; everything else stays.
 */
import { assert, it } from "@effect/vitest";
import type {
  ServerProvider,
  ServerProviderUsageWindow,
  UsageLimitSourceSnapshot,
} from "@t3tools/contracts";
import { describe } from "vite-plus/test";

import { dedupeHubSources, dedupeKey } from "./t3team-providerCapacityDedupe.ts";

const weekly = (usedPercent: number, resetsAt?: string): ServerProviderUsageWindow => ({
  id: "seven_day",
  kind: "weekly",
  label: "Weekly",
  usedPercent,
  ...(resetsAt === undefined ? {} : { resetsAt }),
});

const RESET = "2026-10-19T20:00:00.000Z";

const live = (windows: ServerProviderUsageWindow[], enabled = true): ServerProvider =>
  ({
    instanceId: "claudeAgent",
    enabled,
    usageLimits: { checkedAt: RESET, windows },
  }) as unknown as ServerProvider;

const source = (accounts: Record<string, ServerProviderUsageWindow[]>): UsageLimitSourceSnapshot =>
  ({
    id: "hub",
    kind: "cliproxy",
    label: "hub",
    checkedAt: RESET,
    accounts: Object.entries(accounts).map(([id, windows]) => ({
      id,
      driver: "claudeAgent",
      usageLimits: { checkedAt: RESET, windows },
    })),
  }) as unknown as UsageLimitSourceSnapshot;

const accountWindows = (sources: UsageLimitSourceSnapshot[]) =>
  sources[0]!.accounts.map((account) => [
    account.id,
    account.usageLimits.windows.map((window) => window.usedPercent),
  ]);

describe("dedupeKey", () => {
  it("keys on pool + kind + reset; a resetless window has no key", () => {
    assert.equal(dedupeKey(weekly(1, RESET)), `Weekly:weekly:${RESET}`);
    assert.equal(dedupeKey(weekly(1)), undefined);
  });
});

describe("dedupeHubSources", () => {
  it("drops the mirror, keeps distinct resets and resetless windows", () => {
    const deduped = dedupeHubSources(
      [live([weekly(100, RESET)])],
      [
        source({
          mirror: [weekly(43, RESET)],
          mixed: [weekly(43, RESET), weekly(12, "2026-10-16T20:00:00.000Z"), weekly(5)],
          idle: [],
        }),
      ],
    );
    assert.deepStrictEqual(accountWindows(deduped), [
      ["mixed", [12, 5]],
      ["idle", []],
    ]);
  });

  it("ignores disabled instances", () => {
    const deduped = dedupeHubSources(
      [live([weekly(100, RESET)], false)],
      [source({ mirror: [weekly(43, RESET)] })],
    );
    assert.deepStrictEqual(accountWindows(deduped), [["mirror", [43]]]);
  });
});
