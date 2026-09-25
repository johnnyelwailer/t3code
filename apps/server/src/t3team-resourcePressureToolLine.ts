/**
 * Proactive pressure push on tool results (flag `NEXI_FF_RESOURCE_PRESSURE`):
 * agents never poll memory pressure. Instead every result of a
 * pressure-impacting tool — `t3team.thread.start_child`,
 * `t3team.orchestration.run` / `.resume` — carries one compact line with the
 * level, the T3 app-tree RSS, the machine verdict and one advisory, so the
 * agent sees the state exactly when it adds load.
 *
 * It reads the monitor's cached sample (never triggers a scan). With the flag
 * off the monitor has no auto-pause and the binding is returned untouched —
 * no wrapper, no read, zero overhead.
 *
 * Background jobs are spawned inside the provider runtime's own shell tool
 * (no host tool result to annotate); they get the turn-context note instead.
 *
 * @module t3team-resourcePressureToolLine
 */
import type { ResourcePressureLevel, ResourcePressureSnapshot } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { T3TeamToolBinding, T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { resolveT3TeamCanonicalToolId } from "./t3team-toolBrokerLegacyToolIds.ts";
import type { ResourcePressureMonitorShape } from "./t3team-resourcePressureMonitor.ts";

export const PRESSURE_IMPACTING_TOOL_IDS: ReadonlySet<string> = new Set([
  "t3team.thread.start_child",
  "t3team.orchestration.run",
  "t3team.orchestration.resume",
]);

export const PRESSURE_ADVISORY: Record<ResourcePressureLevel, string> = {
  ok: "no action needed",
  warn: "avoid parallel spawns; prefer finishing current work",
  critical:
    "expect dispatch backoff — new turns (including a new child's first turn) are held until pressure clears; finish in-flight work and end the turn",
};

const gib = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

export function pressureLine(snapshot: ResourcePressureSnapshot): string {
  const available =
    snapshot.totalMemoryBytes > 0
      ? `${Math.round((snapshot.availableMemoryBytes / snapshot.totalMemoryBytes) * 100)}% available`
      : "availability unknown";
  const machine = snapshot.osLevel === null ? available : `macOS ${snapshot.osLevel}, ${available}`;
  return (
    `[host] memory pressure: ${snapshot.level} · app tree ${gib(snapshot.appTreeRssBytes)} · ` +
    `machine: ${machine} · ${snapshot.level}: ${PRESSURE_ADVISORY[snapshot.level]}`
  );
}

/** Wrap a thread binding so pressure-impacting tool results carry the pressure line. */
export function withPressureLines<B extends T3TeamToolBinding | undefined>(
  binding: B,
  monitor: ResourcePressureMonitorShape | undefined,
): B {
  if (binding === undefined || monitor?.autoPause === undefined) return binding;
  const callTool: T3TeamToolBinding["callTool"] = (input) => {
    const result = binding.callTool(input);
    if (!PRESSURE_IMPACTING_TOOL_IDS.has(resolveT3TeamCanonicalToolId(input.tool))) return result;
    return Effect.all([result, monitor.report]).pipe(
      Effect.map(([toolResult, report]) =>
        report.snapshot === null
          ? toolResult
          : attachPressureLine(toolResult, pressureLine(report.snapshot)),
      ),
    );
  };
  return { ...binding, callTool };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Every transport sees the line: MCP returns `structuredContent` (object results get a
 * `hostResourcePressure` key) or, for errors, only the first text item (the line is folded
 * into it); in-process callers read `content` (the line is one more text item).
 */
export function attachPressureLine(
  result: T3TeamToolCallResult,
  line: string,
): T3TeamToolCallResult {
  if (result.isError === true) {
    const [first, ...rest] = result.content;
    const text = first === undefined ? line : `${first.text}\n${line}`;
    return { ...result, content: [{ type: "text", text }, ...rest] };
  }
  return {
    ...result,
    content: [...result.content, { type: "text", text: line }],
    ...(isPlainObject(result.structuredContent)
      ? { structuredContent: { ...result.structuredContent, hostResourcePressure: line } }
      : {}),
  };
}
