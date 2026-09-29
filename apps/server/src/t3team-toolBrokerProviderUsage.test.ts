/**
 * `t3team.runtime.provider_usage` reads the published provider snapshots and
 * hub snapshots per INSTANCE — it samples nothing itself.
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
});
