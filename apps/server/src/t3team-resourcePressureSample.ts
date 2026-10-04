/**
 * One resource-pressure sample (flag `NEXI_FF_RESOURCE_PRESSURE`): read host
 * memory, the macOS kernel verdict and one T3 process-tree scan, classify,
 * apply hysteresis, publish the snapshot, and journal a level transition.
 * Split out of `t3team-resourcePressureMonitor.ts`, which owns the loop.
 *
 * @module t3team-resourcePressureSample
 */
import type {
  OsMemoryPressureLevel,
  ResourcePressureAccumulation,
  ResourcePressureSnapshot,
  ResourceTelemetrySnapshot,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import type { ResourcePressureEventRepositoryShape } from "./persistence/Services/t3team-ResourcePressureEvents.ts";
import type * as HostResources from "./resourceTelemetry/HostResources.ts";
import type * as ResourceTelemetry from "./resourceTelemetry/ResourceTelemetry.ts";
import {
  applyHysteresis,
  buildPressureSnapshot,
  classifyPressure,
  DEESCALATE_SAMPLES,
  type HysteresisState,
} from "./t3team-resourcePressureModel.ts";

export interface ResourcePressureSampleDeps {
  readonly hostResources: HostResources.HostResources["Service"];
  readonly telemetry: ResourceTelemetry.ResourceTelemetry["Service"];
  readonly events: ResourcePressureEventRepositoryShape;
  readonly readOsLevel: Effect.Effect<OsMemoryPressureLevel | null>;
  readonly darwin: boolean;
  readonly serverPid: number;
  readonly sampleIntervalMs: number;
  readonly latest: Ref.Ref<ResourcePressureSnapshot | null>;
  readonly hysteresis: Ref.Ref<HysteresisState>;
}

/** A telemetry snapshot older than this many sample periods counts as stale. */
const STALE_AFTER_PERIODS = 2;

export const makeSampleOnce = (deps: ResourcePressureSampleDeps) =>
  Effect.gen(function* () {
    const scan = deps.telemetry.refresh.pipe(
      Effect.map((snapshot) => ({ snapshot, failed: false })),
      Effect.catch(() =>
        deps.telemetry.latest.pipe(
          Effect.map((snapshot): { snapshot: ResourceTelemetrySnapshot; failed: boolean } => ({
            snapshot,
            failed: true,
          })),
        ),
      ),
    );
    const accumulation = deps.events.readAccumulation.pipe(
      Effect.map((value): ResourcePressureAccumulation | null => value),
      Effect.catch(() => Effect.succeed(null)),
    );
    const [host, osLevel, telemetry, worktrees] = yield* Effect.all(
      [deps.hostResources.read, deps.readOsLevel, scan, accumulation],
      { concurrency: "unbounded" },
    );
    const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
    const telemetryAgeMs = nowMs - DateTime.toEpochMillis(telemetry.snapshot.readAt);
    const stale = telemetry.failed || telemetryAgeMs > STALE_AFTER_PERIODS * deps.sampleIntervalMs;
    const candidate = classifyPressure({
      host,
      osLevel,
      appTreeRssBytes: telemetry.snapshot.groups.allT3.currentRssBytes,
      darwin: deps.darwin,
    });
    const previous = yield* Ref.get(deps.hysteresis);
    const next = applyHysteresis(previous, candidate.level);
    yield* Ref.set(deps.hysteresis, next);
    const reasons = [...candidate.reasons];
    if (stale) {
      reasons.push(
        `process scan unavailable; T3 numbers are ${Math.round(telemetryAgeMs / 1000)}s old`,
      );
    }
    if (next.level !== candidate.level) {
      reasons.push(
        `holding ${next.level} until ${DEESCALATE_SAMPLES} lower samples (now ${candidate.level})`,
      );
    }
    const published = buildPressureSnapshot({
      sampledAt: nowMs,
      host,
      osLevel,
      telemetry: telemetry.snapshot,
      level: next.level,
      reasons,
      serverPid: deps.serverPid,
      sampleIntervalMs: deps.sampleIntervalMs,
      accumulation: worktrees,
      processDataStale: stale,
    });
    yield* Ref.set(deps.latest, published);
    if (next.level === previous.level) return;
    const top = published.topConsumers[0];
    yield* Effect.logWarning("resource pressure level changed", {
      from: previous.level,
      to: next.level,
      reasons,
    });
    yield* deps.events
      .append({
        occurredAt: nowMs,
        fromLevel: previous.level,
        toLevel: next.level,
        availableMemoryBytes: published.availableMemoryBytes,
        totalMemoryBytes: published.totalMemoryBytes,
        appTreeRssBytes: published.appTreeRssBytes,
        reasons,
        topProcessName: top?.name ?? null,
        topProcessRssBytes: top?.residentBytes ?? 0,
      })
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("resource pressure event not persisted", { cause: error.message }),
        ),
      );
  });
