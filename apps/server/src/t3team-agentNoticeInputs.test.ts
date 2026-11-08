import { ResourcePressureThresholds } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { clearUsageSampleHistory } from "./provider/t3team-providerUsageHistory.ts";
import type { ProviderCapacityWindow } from "./provider/t3team-providerCapacityWindows.ts";
import { DEFAULT_NOTICE_THRESHOLDS } from "./t3team-agentNoticeEngine.ts";
import {
  makeAgentNoticeInputs,
  noticeThresholdsFromSettings,
  type AgentNoticeSources,
  type InstanceCapacity,
} from "./t3team-agentNoticeInputs.ts";
import { makeAgentNotices } from "./t3team-agentNotices.ts";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const GIB = 1024 ** 3;
const decodeSettings = Schema.decodeSync(ResourcePressureThresholds);

const window = (usedPercent: number, sampleKey = "codex:primary"): ProviderCapacityWindow => ({
  sampleKey,
  kind: "session",
  pool: "5h session",
  usedPercent,
  resetsAt: DateTime.formatIso(DateTime.makeUnsafe(NOW + 4 * 3_600_000)),
  resetsDisplay: "16:00 UTC",
  severity: "normal",
});

const capacities: Record<string, InstanceCapacity> = {
  "codex-work": { label: "Codex (work)", windows: [window(96)] },
  "claude-team": {
    label: "Claude (team)",
    windows: [window(88, "claude:session")],
  },
  "claude-idle": { label: "Claude (idle)", windows: [] },
};

const sources = (overrides: Partial<AgentNoticeSources> = {}): AgentNoticeSources => ({
  nowMs: Effect.succeed(NOW),
  providerInstanceId: () => Effect.succeed("codex-work"),
  activeChildren: () => Effect.succeed([]),
  instanceCapacity: (instanceId) => Effect.succeed(capacities[instanceId]),
  runningJobs: () => Effect.succeed([]),
  processStats: Effect.succeed(new Map()),
  hostCpuUtilization: Effect.succeed(null),
  readSettings: undefined,
  ...overrides,
});

describe("agent notice inputs", () => {
  it.effect("reads the usage windows of the thread's own account", () =>
    Effect.gen(function* () {
      const inputs = makeAgentNoticeInputs(sources());
      const own = yield* inputs.ownUsage("thread-a");
      assert.deepStrictEqual(
        own.map((subject) => [subject.subject, subject.windows[0]?.usedPercent]),
        [["Codex (work)", 96]],
      );
    }),
  );

  it.effect("names each active child with its account, skipping accounts without windows", () =>
    Effect.gen(function* () {
      const inputs = makeAgentNoticeInputs(
        sources({
          activeChildren: () =>
            Effect.succeed([
              { id: "c1", title: "Fix login", providerInstanceId: "claude-team" },
              { id: "c2", title: null, providerInstanceId: "claude-team" },
              { id: "c3", title: "Idle one", providerInstanceId: "claude-idle" },
              { id: "c4", title: "Unknown", providerInstanceId: "missing" },
            ]),
        }),
      );
      const children = yield* inputs.childUsage("parent");
      assert.deepStrictEqual(
        children.map((subject) => subject.subject),
        ["child Fix login on Claude (team)", "child c2 on Claude (team)"],
      );
    }),
  );

  it.effect("joins running jobs with the process scan by PID", () =>
    Effect.gen(function* () {
      const inputs = makeAgentNoticeInputs(
        sources({
          runningJobs: () =>
            Effect.succeed([
              { command: "npm run dev", pid: 4242 },
              { command: "gone", pid: 999 },
            ]),
          processStats: Effect.succeed(
            new Map([[4242, { startTimeMs: 7, cpuPercent: 3, residentBytes: 3 * GIB }]]),
          ),
        }),
      );
      assert.deepStrictEqual(yield* inputs.ownedProcesses("thread-a"), [
        {
          pid: 4242,
          name: "npm run dev",
          threadId: "thread-a",
          startTimeMs: 7,
          cpuPercent: 3,
          residentBytes: 3 * GIB,
        },
      ]);
    }),
  );

  it.effect("has no processes without a job list or a scan", () =>
    Effect.gen(function* () {
      const inputs = makeAgentNoticeInputs(
        sources({ runningJobs: undefined, processStats: undefined }),
      );
      assert.deepStrictEqual(yield* inputs.ownedProcesses("thread-a"), []);
    }),
  );

  it.effect("turns host CPU into a percentage, or nothing", () =>
    Effect.gen(function* () {
      const some = makeAgentNoticeInputs(sources({ hostCpuUtilization: Effect.succeed(0.93) }));
      assert.strictEqual(Math.round((yield* some.hostCpuPercent) ?? -1), 93);
      assert.strictEqual(yield* makeAgentNoticeInputs(sources()).hostCpuPercent, undefined);
      const broken = makeAgentNoticeInputs(
        sources({ hostCpuUtilization: Effect.die("no sample") }),
      );
      assert.strictEqual(yield* broken.hostCpuPercent, undefined);
    }),
  );

  it.effect("reads the thresholds from the settings and falls back to the defaults", () =>
    Effect.gen(function* () {
      const settings = decodeSettings({
        noticeUsageWarnPercent: 50,
        noticeUsageCriticalPercent: 60,
        noticeProcessRssWarnGiB: 1,
        noticeProcessRssCriticalGiB: 3,
        noticeQuietMinutes: 2,
      });
      const custom = makeAgentNoticeInputs(sources({ readSettings: Effect.succeed(settings) }));
      assert.deepStrictEqual(yield* custom.thresholds, {
        ...DEFAULT_NOTICE_THRESHOLDS,
        usageWarnPercent: 50,
        usageCriticalPercent: 60,
        processRssWarnBytes: GIB,
        processRssCriticalBytes: 3 * GIB,
        quietMs: 120_000,
      });
      const failing = makeAgentNoticeInputs(sources({ readSettings: Effect.die("unreadable") }));
      assert.deepStrictEqual(yield* failing.thresholds, DEFAULT_NOTICE_THRESHOLDS);
      assert.deepStrictEqual(
        yield* makeAgentNoticeInputs(sources()).thresholds,
        DEFAULT_NOTICE_THRESHOLDS,
      );
      assert.deepStrictEqual(
        noticeThresholdsFromSettings(decodeSettings({})),
        DEFAULT_NOTICE_THRESHOLDS,
      );
    }),
  );

  it.effect("a failing source adds nothing instead of failing the tool call", () =>
    Effect.gen(function* () {
      const inputs = makeAgentNoticeInputs(
        sources({
          providerInstanceId: () => Effect.die("thread not found"),
          activeChildren: () => Effect.die("projection down"),
        }),
      );
      assert.deepStrictEqual(yield* inputs.ownUsage("thread-a"), []);
      assert.deepStrictEqual(yield* inputs.childUsage("thread-a"), []);
    }),
  );

  it.effect("drives a note end to end and honours a custom threshold", () =>
    Effect.gen(function* () {
      clearUsageSampleHistory();
      const lenient = decodeSettings({
        noticeUsageWarnPercent: 97,
        noticeUsageCriticalPercent: 99,
      });
      const quiet = makeAgentNotices(
        makeAgentNoticeInputs(sources({ readSettings: Effect.succeed(lenient) })),
      );
      assert.strictEqual(yield* quiet.noteFor("thread-a"), null);
      clearUsageSampleHistory();
      const normal = makeAgentNotices(makeAgentNoticeInputs(sources()));
      assert.include(
        (yield* normal.noteFor("thread-a")) ?? "",
        "[host] Codex (work): 5h session 96% used",
      );
    }),
  );
});
