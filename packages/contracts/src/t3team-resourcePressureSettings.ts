import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const gib = Schema.Number.check(Schema.isBetween({ minimum: 0.1, maximum: 1024 }));
const percent = Schema.Number.check(Schema.isBetween({ minimum: 0.1, maximum: 50 }));
const usagePercent = Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 100 }));
const cpuPercent = Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 1600 }));
const minutes = Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 120 }));
/** How long available memory must stay under the critical line before it escalates to critical. */
const sustainMs = Schema.Number.check(Schema.isBetween({ minimum: 1000, maximum: 1_800_000 }));

export const ResourcePressureThresholds = Schema.Struct({
  warningAvailableGiB: gib.pipe(Schema.withDecodingDefault(Effect.succeed(6))),
  criticalAvailableGiB: gib.pipe(Schema.withDecodingDefault(Effect.succeed(3))),
  warningRamPercent: percent.pipe(Schema.withDecodingDefault(Effect.succeed(15))),
  criticalRamPercent: percent.pipe(Schema.withDecodingDefault(Effect.succeed(10))),
  criticalSustainMs: sustainMs.pipe(Schema.withDecodingDefault(Effect.succeed(60_000))),
  recoveryGiB: gib.pipe(Schema.withDecodingDefault(Effect.succeed(1))),
  recoveryRamPercent: percent.pipe(Schema.withDecodingDefault(Effect.succeed(2))),
  noticeUsageWarnPercent: usagePercent.pipe(Schema.withDecodingDefault(Effect.succeed(80))),
  noticeUsageCriticalPercent: usagePercent.pipe(Schema.withDecodingDefault(Effect.succeed(95))),
  noticeProcessCpuPercent: cpuPercent.pipe(Schema.withDecodingDefault(Effect.succeed(80))),
  noticeProcessRssWarnGiB: gib.pipe(Schema.withDecodingDefault(Effect.succeed(2))),
  noticeProcessRssCriticalGiB: gib.pipe(Schema.withDecodingDefault(Effect.succeed(4))),
  noticeHostCpuPercent: usagePercent.pipe(Schema.withDecodingDefault(Effect.succeed(90))),
  noticeQuietMinutes: minutes.pipe(Schema.withDecodingDefault(Effect.succeed(5))),
})
  .check(
    Schema.makeFilter(
      (value) =>
        (value.warningAvailableGiB > value.criticalAvailableGiB &&
          value.warningRamPercent > value.criticalRamPercent) ||
        "Warning headroom must exceed critical headroom.",
    ),
  )
  .check(
    Schema.makeFilter(
      (value) =>
        (value.noticeUsageWarnPercent < value.noticeUsageCriticalPercent &&
          value.noticeProcessRssWarnGiB < value.noticeProcessRssCriticalGiB) ||
        "Notice warning levels must stay below their critical levels.",
    ),
  );
export type ResourcePressureThresholds = typeof ResourcePressureThresholds.Type;
export const DEFAULT_RESOURCE_PRESSURE_THRESHOLDS = Schema.decodeSync(ResourcePressureThresholds)(
  {},
);
