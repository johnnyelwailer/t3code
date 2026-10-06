import type { ResourcePressureSnapshot } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { T3TeamToolBinding } from "./t3team-toolBroker.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import { makeResourcePressureAutoPause } from "./t3team-resourcePressureAutoPause.ts";
import type { ResourcePressureMonitorShape } from "./t3team-resourcePressureMonitor.ts";
import { pressureLine, withPressureLines } from "./t3team-resourcePressureToolLine.ts";

const GIB = 1024 ** 3;

const snapshot = {
  sampledAt: 0,
  level: "critical",
  reasons: ["macOS reports critical memory pressure"],
  osLevel: "critical",
  totalMemoryBytes: 16 * GIB,
  availableMemoryBytes: 1 * GIB,
  appTreeRssBytes: 7 * GIB,
  appTreeProcessCount: 9,
  processDataStale: false,
  topConsumers: [],
  recommendation: "",
  sampleIntervalMs: 20_000,
} as unknown as ResourcePressureSnapshot;

const binding = (result = okResult({ ok: true, childThreadId: "c1" })): T3TeamToolBinding => ({
  threadId: ThreadId.make("parent"),
  listServers: () => [],
  callTool: () => Effect.succeed(result),
  readResource: () => Effect.die("unused"),
});

const monitorWith = (autoPause: ResourcePressureMonitorShape["autoPause"]) => ({
  report: Effect.succeed({ enabled: true, snapshot, recentEvents: [] }),
  ...(autoPause ? { autoPause } : {}),
});

const call = (surface: T3TeamToolBinding, tool: string) =>
  surface.callTool({ server: "t3team", tool, arguments: {} });

describe("proactive pressure push on tool results", () => {
  it.effect("orchestration.resume is never refused: its result carries the pressure line", () =>
    Effect.gen(function* () {
      const monitor = monitorWith(yield* makeResourcePressureAutoPause());
      const surface = withPressureLines(binding(), monitor);
      const result = yield* call(surface, "t3team.orchestration.resume");
      const line =
        "[host] memory pressure: critical · app tree 7.0 GiB · machine: macOS critical, 6% available · " +
        "critical: do not start new children or parallel work; finish in-flight work and end the turn";
      assert.strictEqual(pressureLine(snapshot), line);
      assert.isUndefined(result.isError);
      assert.strictEqual(result.content.at(-1)?.text, line);
      // MCP returns structuredContent: the line rides there too, the result is intact.
      assert.deepStrictEqual(result.structuredContent, {
        ok: true,
        childThreadId: "c1",
        hostResourcePressure: line,
      });
    }),
  );

  it.effect("orchestration.run errors fold the line into the first (MCP-visible) text", () =>
    Effect.gen(function* () {
      const monitor = monitorWith(yield* makeResourcePressureAutoPause());
      const surface = withPressureLines(binding(errorResult("cap reached")), monitor);
      const result = yield* call(surface, "t3team.orchestration.run");
      assert.isTrue(result.isError);
      assert.strictEqual(result.content[0]?.text, `cap reached\n${pressureLine(snapshot)}`);
    }),
  );

  it.effect("non-impacting tools are untouched", () =>
    Effect.gen(function* () {
      const monitor = monitorWith(yield* makeResourcePressureAutoPause());
      const result = yield* call(withPressureLines(binding(), monitor), "t3team.thread.rename");
      assert.strictEqual(result.content.length, 1);
      assert.notProperty(result.structuredContent as object, "hostResourcePressure");
    }),
  );

  it("flag off (no auto-pause on the monitor): the binding is returned as-is", () => {
    const original = binding();
    assert.strictEqual(withPressureLines(original, monitorWith(undefined)), original);
    assert.strictEqual(withPressureLines(original, undefined), original);
  });
});
