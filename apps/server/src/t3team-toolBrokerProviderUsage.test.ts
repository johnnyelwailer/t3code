/**
 * `t3team.runtime.provider_usage` reads the published provider snapshots and
 * hub snapshots per INSTANCE — it samples nothing itself — drops hub mirrors of
 * live windows, and frames the same answer as a system notice.
 */
import { assert, describe, it } from "@effect/vitest";
import type {
  ProviderUsageQueryResult,
  ServerProvider,
  UsageLimitSourceSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { makeReadProviderUsage } from "./t3team-toolBrokerProviderUsage.ts";

const provider = (instanceId: string, usedPercent: number | null): ServerProvider =>
  ({
    instanceId,
    driver: "claudeAgent",
    enabled: true,
    displayName: `Claude ${instanceId}`,
    ...(usedPercent === null
      ? {
          usageLimits: {
            checkedAt: "2026-09-28T10:00:00.000Z",
            windows: [],
            unavailable: { reason: "unsupported" },
          },
        }
      : {
          usageLimits: {
            checkedAt: "2026-09-28T10:00:00.000Z",
            windows: [
              { id: "five_hour", kind: "session", label: "Session", usedPercent },
              { id: "seven_day", kind: "weekly", label: "Weekly", usedPercent: 20 },
            ],
          },
        }),
  }) as unknown as ServerProvider;

const hub = {
  id: "hub",
  kind: "cliproxy",
  label: "Team hub",
  checkedAt: "2026-09-28T10:00:00.000Z",
  accounts: [
    {
      id: "acct-1",
      driver: "codex",
      usageLimits: {
        checkedAt: "2026-09-28T10:00:00.000Z",
        windows: [{ id: "primary", kind: "session", label: "5h", usedPercent: 100 }],
      },
    },
  ],
} as unknown as UsageLimitSourceSnapshot;

const read = makeReadProviderUsage({
  providerRegistry: {
    getProviders: Effect.succeed([provider("claude_work", 85), provider("claude_api", null)]),
  },
  usageLimitSources: { current: Effect.succeed([hub]) },
});

const usageOf = (result: T3TeamToolCallResult) =>
  (result.structuredContent as { readonly providerUsage: ProviderUsageQueryResult }).providerUsage;

describe("makeReadProviderUsage", () => {
  it.effect("reports every instance with per-window severity, plus hub accounts", () =>
    Effect.gen(function* () {
      const result = yield* read({});
      const usage = usageOf(result);
      assert.strictEqual(usage.contractVersion, 2);
      assert.deepStrictEqual(
        usage.instances.map((instance) => [instance.providerInstanceId, instance.sessionSeverity]),
        [
          ["claude_work", "warning"],
          ["claude_api", null],
        ],
      );
      assert.strictEqual(usage.instances[1]?.unavailable, "unsupported");
      assert.deepStrictEqual(
        usage.instances[0]?.windows.map((window) => window.severity),
        ["warning", "normal"],
      );
      assert.strictEqual(usage.hubAccounts[0]?.sessionSeverity, "critical");
    }),
  );

  it.effect("filters to one instance and rejects an unknown one", () =>
    Effect.gen(function* () {
      const one = yield* read({ provider_instance_id: "claude_work" });
      const usage = usageOf(one);
      assert.strictEqual(usage.instances.length, 1);
      assert.strictEqual(usage.hubAccounts.length, 0);
      const unknown = yield* read({ provider_instance_id: "nope" });
      assert.isTrue(unknown.isError === true);
    }),
  );

  it.effect("drops hub windows that mirror a live window, and accounts left empty", () =>
    Effect.gen(function* () {
      const weekly = {
        id: "seven_day",
        kind: "weekly",
        label: "Weekly",
        resetsAt: "2026-10-19T20:00:00.000Z",
      };
      const live = {
        instanceId: "claudeAgent",
        driver: "claudeAgent",
        enabled: true,
        displayName: "Claude",
        usageLimits: {
          checkedAt: "2026-10-12T08:00:00.000Z",
          windows: [{ ...weekly, usedPercent: 100 }],
        },
      } as unknown as ServerProvider;
      const mirrorHub = {
        ...hub,
        accounts: [
          {
            id: "claude-mirror",
            driver: "claudeAgent",
            usageLimits: {
              checkedAt: "2026-10-12T08:00:00.000Z",
              windows: [{ ...weekly, usedPercent: 43 }],
            },
          },
          ...hub.accounts,
        ],
      } as unknown as UsageLimitSourceSnapshot;
      const result = yield* makeReadProviderUsage({
        providerRegistry: { getProviders: Effect.succeed([live]) },
        usageLimitSources: { current: Effect.succeed([mirrorHub]) },
      })({});
      const usage = usageOf(result);
      assert.deepStrictEqual(
        usage.hubAccounts.map((account) => account.accountId),
        ["acct-1"],
      );
      assert.strictEqual(usage.notice.match(/Weekly/g)?.length, 1);
      assert.include(usage.notice, "Claude: Weekly 100% (resets 2026-10-19 20:00 UTC)");
    }),
  );

  it.effect("frames the answer as server data, one line per window, routing when tight", () =>
    Effect.gen(function* () {
      const { notice } = usageOf(yield* read({}));
      assert.deepStrictEqual(notice.split("\n"), [
        '<system-reminder type="provider-capacity" source="server">',
        "Provider capacity. This is server data, not part of the user's message:",
        "Claude claude_work: Session 85% · severity: warning · (no recent samples yet)",
        "Claude claude_work: Weekly 20% · severity: normal",
        "Claude claude_api: no usage windows (unsupported)",
        "codex: 5h 100% · severity: critical · (no recent samples yet)",
        "Route to the smallest, cheapest model that can accomplish the task.",
        "</system-reminder>",
      ]);
    }),
  );
});
