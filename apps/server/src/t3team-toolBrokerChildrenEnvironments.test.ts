/**
 * `environments` op for t3team.thread.children — the DISCOVERY half of the
 * cross-environment start_child feature. Covers the pure entry builder
 * (own environment, recorded cross-env bindings, dedup, exclusions) and the
 * op's result shape (default case stays own-only with the "no other
 * environments" hint; cross-env entries carry the delivery boundary; the
 * history read failure surfaces as a tool error, not a throw).
 *
 * Kept in a t3team-prefixed file per the additive guard.
 */
import * as Effect from "effect/Effect";
import { assert, describe, it } from "@effect/vitest";

import { buildChildrenEnvironmentEntries, opEnvironments } from "./t3team-toolBrokerChildrenEnvironments.ts";
import type { T3TeamChildrenToolDeps } from "./t3team-toolBrokerChildrenTypes.ts";

type HistoryRow = {
  readonly environmentId: string;
  readonly label?: string;
  readonly threadCount: number;
  readonly latestThreadAt: string;
};

function mkDeps(
  overrides: {
    readonly localEnvironmentId?: string;
    readonly history?: ReadonlyArray<HistoryRow>;
    readonly historyError?: string;
  } = {},
): T3TeamChildrenToolDeps {
  const historyError = overrides.historyError;
  return {
    callerThreadId: "thread-1" as never,
    callerProjectId: "project-1" as never,
    localEnvironmentId: overrides.localEnvironmentId,
    loadThreadDetail: () => Effect.succeed(undefined),
    loadThreadShell: () => Effect.succeed(undefined),
    listProjectThreadShells: () => Effect.succeed([]),
    listChildThreadIds: () => Effect.succeed([]),
    listParentChildRelations: () => Effect.succeed([]),
    listEnvironmentBindings: () =>
      historyError !== undefined
        ? Effect.fail(historyError)
        : Effect.succeed(overrides.history ?? []),
    appendActivity: () => Effect.void,
    interruptTurn: () => Effect.void,
    settleThread: () => Effect.void,
    drainOwnMailbox: () => Effect.succeed({ state: "dispatched", delivered: 0, subjects: [] }),
    nowIso: () => "2026-09-14T00:00:00.000Z",
    newId: () => "id",
  };
}

// ── buildChildrenEnvironmentEntries ──────────────────────────────────────────

describe("buildChildrenEnvironmentEntries", () => {
  it("returns the own environment as the default when no history is recorded", () => {
    const entries = buildChildrenEnvironmentEntries({
      localEnvironmentId: "env-local",
      history: [],
    });
    assert.strictEqual(entries.length, 1);
    assert.deepStrictEqual(entries[0], {
      environmentId: "env-local",
      source: "own",
      isDefault: true,
      childrenCount: 0,
      delivery: entries[0]!.delivery,
    });
    assert.strictEqual(entries[0]!.isDefault, true);
    assert.strictEqual(entries[0]!.source, "own");
    assert.ok(entries[0]!.delivery.includes("fully reachable"));
  });

  it("omits the own entry when the host has no local environment id", () => {
    const entries = buildChildrenEnvironmentEntries({
      localEnvironmentId: undefined,
      history: [{ environmentId: "env-a", threadCount: 2, latestThreadAt: "t" }],
    });
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0]!.environmentId, "env-a");
    assert.strictEqual(entries[0]!.source, "history");
    assert.strictEqual(entries[0]!.isDefault, false);
    assert.strictEqual(entries[0]!.childrenCount, 2);
  });

  it("dedups history per environmentId, newest recorded label wins, skips the local id", () => {
    const entries = buildChildrenEnvironmentEntries({
      localEnvironmentId: "env-local",
      history: [
        // Newest first (the query orders by latestThreadAt DESC): the first
        // occurrence of env-remote (the newer label) wins over the older shape.
        { environmentId: "env-remote", label: "GHA runner v2", threadCount: 1, latestThreadAt: "newer" },
        { environmentId: "env-remote", label: "GHA runner", threadCount: 3, latestThreadAt: "older" },
        { environmentId: "env-other", threadCount: 1, latestThreadAt: "t" },
        { environmentId: "env-local", threadCount: 9, latestThreadAt: "t" }, // never own
        { environmentId: "   ", threadCount: 1, latestThreadAt: "t" }, // empty id skipped
      ],
    });
    const byId = new Map(entries.map((entry) => [entry.environmentId, entry]));
    assert.strictEqual(entries.length, 3);
    assert.strictEqual(byId.get("env-remote")?.label, "GHA runner v2");
    assert.strictEqual(byId.get("env-remote")?.childrenCount, 1);
    assert.strictEqual(byId.get("env-other")?.label, undefined);
    // env-local appears ONLY as the own entry, never as a recorded binding.
    assert.strictEqual(byId.get("env-local")?.source, "own");
    // Every history entry carries the cross-environment delivery boundary.
    for (const entry of entries.filter((entry) => entry.source === "history")) {
      assert.ok(entry.delivery.includes("separate channel"), "delivery boundary documented");
    }
  });
});

// ── opEnvironments ───────────────────────────────────────────────────────────

describe("opEnvironments", () => {
  it("default case: own environment only, with the discovery hint", async () => {
    const deps = mkDeps({ localEnvironmentId: "env-local" });
    const result = await Effect.runPromise(opEnvironments(deps, {}));
    const payload = result.structuredContent as {
      ok: boolean;
      op?: string;
      environments: Array<{ environmentId: string; isDefault: boolean }>;
      hint?: string;
      delivery_boundary: string;
    };
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.op, "environments");
    assert.strictEqual(payload.environments.length, 1);
    assert.strictEqual(payload.environments[0]?.environmentId, "env-local");
    assert.strictEqual(payload.environments[0]?.isDefault, true);
    assert.ok(payload.hint?.includes("No other environments"), "hint present in the default case");
    assert.ok(payload.delivery_boundary.includes("separate channel"));
  });

  it("cross-env entries: no hint, history entries not default", async () => {
    const deps = mkDeps({
      localEnvironmentId: "env-local",
      history: [
        {
          environmentId: "env-remote",
          label: "GHA runner",
          threadCount: 4,
          latestThreadAt: "2026-09-13T00:00:00.000Z",
        },
      ],
    });
    const result = await Effect.runPromise(opEnvironments(deps, {}));
    const payload = result.structuredContent as {
      ok: boolean;
      environments: Array<{ environmentId: string; isDefault: boolean; childrenCount: number }>;
      hint?: string;
    };
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.environments.length, 2);
    assert.strictEqual(payload.environments[1]?.isDefault, false);
    assert.strictEqual(payload.environments[1]?.childrenCount, 4);
    assert.strictEqual(payload.hint, undefined);
  });

  it("history read failure surfaces as a tool error", async () => {
    const deps = mkDeps({ localEnvironmentId: "env-local", historyError: "store offline" });
    const result = await Effect.runPromise(opEnvironments(deps, {}));
    assert.strictEqual(result.isError, true);
    assert.match(
      String((result.structuredContent as { error?: unknown }).error),
      /Failed to list target environments: store offline/,
    );
  });
});
