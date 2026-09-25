/**
 * Resource-pressure monitor (flag `NEXI_FF_RESOURCE_PRESSURE`).
 *
 * A bounded background sampler over infrastructure that already exists — it
 * adds no new native collection:
 *
 *  - `ResourceTelemetry.refresh` — one on-demand scan of the T3 process tree by
 *    the native `t3-resource-monitor` sidecar (Electron main/renderer/GPU,
 *    server, provider CLIs, terminals, jobs) with per-process RSS + CPU and the
 *    `allT3` aggregate. The sidecar's continuous stream stays demand-driven.
 *  - `HostResources.read` — host total/available memory (5 s cache).
 *  - darwin only: `sysctl kern.memorystatus_vm_pressure_level`, the kernel's
 *    own memory-pressure verdict (the "red" in Activity Monitor).
 *
 * One sample per period (default 20 s, clamped to [10 s, 120 s]); samples never
 * overlap because the loop is sequential. Level transitions (after hysteresis)
 * are appended to the durable `resource_pressure_events` journal and logged.
 * With the flag off the layer forks nothing and reports `enabled: false`.
 *
 * @module t3team-resourcePressureMonitor
 */
import type {
  OsMemoryPressureLevel,
  ResourcePressureReport,
  ResourcePressureSnapshot,
} from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ResourcePressureEventRepositoryLive } from "./persistence/Layers/t3team-ResourcePressureEvents.ts";
import { ResourcePressureEventRepository } from "./persistence/Services/t3team-ResourcePressureEvents.ts";
import * as HostResources from "./resourceTelemetry/HostResources.ts";
import * as ResourceTelemetry from "./resourceTelemetry/ResourceTelemetry.ts";
import {
  isResourcePressureEnabled,
  resolveResourcePressureIntervalMs,
} from "./t3team-resourcePressureFlag.ts";
import {
  applyHysteresis,
  buildPressureSnapshot,
  classifyPressure,
  INITIAL_HYSTERESIS,
  parseDarwinPressureLevel,
  type HysteresisState,
} from "./t3team-resourcePressureModel.ts";

/** Recent transitions returned with every report. */
export const RESOURCE_PRESSURE_REPORT_EVENT_LIMIT = 20;

export interface ResourcePressureMonitorShape {
  readonly report: Effect.Effect<ResourcePressureReport>;
}

export class ResourcePressureMonitor extends Context.Service<
  ResourcePressureMonitor,
  ResourcePressureMonitorShape
>()("t3/t3team-resourcePressureMonitor/ResourcePressureMonitor") {}

export const DISABLED_REPORT: ResourcePressureReport = {
  enabled: false,
  snapshot: null,
  recentEvents: [],
};

const makeEnabled = (sampleIntervalMs: number) =>
  Effect.gen(function* () {
    const hostResources = yield* HostResources.HostResources;
    const telemetry = yield* ResourceTelemetry.ResourceTelemetry;
    const events = yield* ResourcePressureEventRepository;
    const platform = yield* HostProcessPlatform;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const latest = yield* Ref.make<ResourcePressureSnapshot | null>(null);
    const hysteresis = yield* Ref.make<HysteresisState>(INITIAL_HYSTERESIS);

    const readOsLevel: Effect.Effect<OsMemoryPressureLevel | null> =
      platform !== "darwin"
        ? Effect.succeed(null)
        : spawner
            .string(
              ChildProcess.make("/usr/sbin/sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], {
                stdin: "ignore",
                stderr: "ignore",
              }),
            )
            .pipe(
              Effect.timeout("1 second"),
              Effect.map(parseDarwinPressureLevel),
              Effect.catch(() => Effect.succeed(null)),
            );

    const sampleOnce = Effect.gen(function* () {
      const [host, osLevel, snapshot] = yield* Effect.all(
        [
          hostResources.read,
          readOsLevel,
          telemetry.refresh.pipe(Effect.catch(() => telemetry.latest)),
        ],
        { concurrency: "unbounded" },
      );
      const appTreeRssBytes = snapshot.groups.allT3.currentRssBytes;
      const candidate = classifyPressure({ host, osLevel, appTreeRssBytes });
      const previous = yield* Ref.get(hysteresis);
      const next = applyHysteresis(previous, candidate.level);
      yield* Ref.set(hysteresis, next);
      const published = buildPressureSnapshot({
        sampledAt: host.sampledAt,
        host,
        osLevel,
        telemetry: snapshot,
        level: next.level,
        reasons: candidate.reasons,
        serverPid: process.pid,
        sampleIntervalMs,
      });
      yield* Ref.set(latest, published);
      if (next.level === previous.level) return;
      const top = published.topConsumers[0];
      yield* Effect.logWarning("resource pressure level changed", {
        from: previous.level,
        to: next.level,
        reasons: candidate.reasons,
      });
      yield* events
        .append({
          occurredAt: published.sampledAt,
          fromLevel: previous.level,
          toLevel: next.level,
          availableMemoryBytes: published.availableMemoryBytes,
          totalMemoryBytes: published.totalMemoryBytes,
          appTreeRssBytes: published.appTreeRssBytes,
          reasons: candidate.reasons,
          topProcessName: top?.name ?? null,
          topProcessRssBytes: top?.residentBytes ?? 0,
        })
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning("resource pressure event not persisted", { cause: error.message }),
          ),
        );
    });

    yield* Effect.gen(function* () {
      while (true) {
        yield* sampleOnce.pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("resource pressure sample failed", { cause: Cause.pretty(cause) }),
          ),
        );
        yield* Effect.sleep(Duration.millis(sampleIntervalMs));
      }
    }).pipe(Effect.forkScoped);

    const report: ResourcePressureMonitorShape["report"] = Effect.gen(function* () {
      const recentEvents = yield* events
        .listRecent({ limit: RESOURCE_PRESSURE_REPORT_EVENT_LIMIT })
        .pipe(Effect.catch(() => Effect.succeed([])));
      return { enabled: true, snapshot: yield* Ref.get(latest), recentEvents };
    });

    return ResourcePressureMonitor.of({ report });
  });

/** Disabled = a constant report: no fiber, no sample, no service or journal access. */
export const makeResourcePressureMonitor = (options: {
  readonly enabled: boolean;
  readonly sampleIntervalMs: number;
}) =>
  options.enabled
    ? makeEnabled(options.sampleIntervalMs)
    : Effect.succeed(ResourcePressureMonitor.of({ report: Effect.succeed(DISABLED_REPORT) }));

/** The flag is read once when the layer is built (process start), not at import. */
export const ResourcePressureMonitorLive = Layer.effect(
  ResourcePressureMonitor,
  Effect.suspend(() =>
    makeResourcePressureMonitor({
      enabled: isResourcePressureEnabled(),
      sampleIntervalMs: resolveResourcePressureIntervalMs(),
    }),
  ),
).pipe(Layer.provide(ResourcePressureEventRepositoryLive));
