import * as DateTime from "effect/DateTime";
import { ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import { clearUsageSampleHistory } from "./provider/t3team-providerUsageHistory.ts";
import type { ProviderCapacityWindow } from "./provider/t3team-providerCapacityWindows.ts";
import { NOTICE_QUIET_MS, type OwnedProcess } from "./t3team-agentNoticeEngine.ts";
import {
  makeAgentNotices,
  withAgentNotices,
  type AgentNoticeInputs,
  type UsageSubject,
} from "./t3team-agentNotices.ts";
import type { T3TeamToolBinding } from "./t3team-toolBroker.ts";
import { okResult } from "./t3team-toolBrokerHelpers.ts";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const GIB = 1024 ** 3;

const window = (usedPercent: number): ProviderCapacityWindow => ({
  sampleKey: "codex:primary",
  kind: "session",
  pool: "5h session",
  usedPercent,
  resetsAt: DateTime.formatIso(DateTime.makeUnsafe(NOW + 4 * 3_600_000)),
  resetsDisplay: "16:00 UTC",
  severity: "normal",
});

const devServer: OwnedProcess = {
  pid: 4242,
  startTimeMs: 1,
  name: "vite",
  threadId: "parent",
  cpuPercent: 3,
  residentBytes: 3 * GIB,
};

const fixture = (overrides: Partial<AgentNoticeInputs> & { readonly clock?: Ref.Ref<number> }) =>
  Effect.gen(function* () {
    clearUsageSampleHistory();
    const clock = overrides.clock ?? (yield* Ref.make(NOW));
    const inputs: AgentNoticeInputs = {
      nowMs: Ref.get(clock),
      ownUsage: () => Effect.succeed([]),
      childUsage: () => Effect.succeed([]),
      ownedProcesses: () => Effect.succeed([]),
      hostCpuPercent: Effect.succeed(undefined),
      ...overrides,
    };
    const binding: T3TeamToolBinding = {
      threadId: ThreadId.make("parent"),
      listServers: () => [],
      callTool: () => Effect.succeed(okResult({ ok: true })),
      readResource: () => Effect.die("unused"),
    };
    return { clock, surface: withAgentNotices(binding, makeAgentNotices(inputs)) };
  });

const call = (surface: T3TeamToolBinding) =>
  surface.callTool({ server: "t3team", tool: "t3team.thread.search", arguments: {} });

const lastText = (result: { readonly content: ReadonlyArray<{ readonly text: string }> }) =>
  result.content.at(-1)?.text ?? "";

describe("agent notices on tool results", () => {
  it.effect("tells a thread once that its own account is close to its limit", () =>
    Effect.gen(function* () {
      const own: UsageSubject = { subject: "Codex (work)", windows: [window(96)] };
      const { surface } = yield* fixture({ ownUsage: () => Effect.succeed([own]) });
      const first = yield* call(surface);
      assert.include(lastText(first), "[host] Codex (work): 5h session 96% used, resets 16:00 UTC");
      const second = yield* call(surface);
      assert.strictEqual(second.content.length, first.content.length - 1);
    }),
  );

  it.effect("tells a parent which child account is about to run out", () =>
    Effect.gen(function* () {
      const child: UsageSubject = {
        subject: "child Fix login on Claude (team)",
        windows: [window(88)],
      };
      const { surface } = yield* fixture({ childUsage: () => Effect.succeed([child]) });
      const result = yield* call(surface);
      assert.include(lastText(result), "child Fix login on Claude (team): 5h session 88% used");
    }),
  );

  it.effect("names a heavy process, its thread and its numbers, then recovers", () =>
    Effect.gen(function* () {
      const heavy = yield* Ref.make<ReadonlyArray<OwnedProcess>>([devServer]);
      const { surface, clock } = yield* fixture({ ownedProcesses: () => Ref.get(heavy) });
      assert.include(
        lastText(yield* call(surface)),
        "vite (pid 4242, thread parent) holds 3.0 GiB of memory; if it is an idle dev server or watcher, stop it",
      );
      yield* Ref.set(heavy, []);
      yield* Ref.set(clock, NOW + NOTICE_QUIET_MS);
      assert.include(lastText(yield* call(surface)), "memory is back to normal or it has stopped");
    }),
  );

  it.effect("adds nothing when nothing crossed a threshold, or when a read fails", () =>
    Effect.gen(function* () {
      const calm = yield* fixture({
        ownUsage: () => Effect.succeed([{ subject: "Codex", windows: [window(10)] }]),
      });
      assert.strictEqual((yield* call(calm.surface)).content.length, 1);
      const broken = yield* fixture({ ownUsage: () => Effect.die("probe failed") });
      assert.strictEqual((yield* call(broken.surface)).content.length, 1);
    }),
  );

  it.effect("leaves the binding untouched without a notices source", () =>
    Effect.sync(() => {
      const binding: T3TeamToolBinding = {
        threadId: ThreadId.make("parent"),
        listServers: () => [],
        callTool: () => Effect.succeed(okResult({ ok: true })),
        readResource: () => Effect.die("unused"),
      };
      assert.strictEqual(withAgentNotices(binding, undefined), binding);
    }),
  );
});
