import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const gib = Schema.Number.check(Schema.isBetween({ minimum: 0.1, maximum: 1024 }));
const percent = Schema.Number.check(Schema.isBetween({ minimum: 0.1, maximum: 50 }));

export const ResourcePressureThresholds = Schema.Struct({
  warningAvailableGiB: gib.pipe(Schema.withDecodingDefault(Effect.succeed(6))),
  criticalAvailableGiB: gib.pipe(Schema.withDecodingDefault(Effect.succeed(3))),
  warningRamPercent: percent.pipe(Schema.withDecodingDefault(Effect.succeed(15))),
  criticalRamPercent: percent.pipe(Schema.withDecodingDefault(Effect.succeed(10))),
  recoveryGiB: gib.pipe(Schema.withDecodingDefault(Effect.succeed(1))),
  recoveryRamPercent: percent.pipe(Schema.withDecodingDefault(Effect.succeed(2))),
}).check(
  Schema.makeFilter(
    (value) =>
      (value.warningAvailableGiB > value.criticalAvailableGiB &&
        value.warningRamPercent > value.criticalRamPercent) ||
      "Warning headroom must exceed critical headroom.",
  ),
);
export type ResourcePressureThresholds = typeof ResourcePressureThresholds.Type;
export const DEFAULT_RESOURCE_PRESSURE_THRESHOLDS = Schema.decodeSync(ResourcePressureThresholds)(
  {},
);
