/**
 * Live stats from a provider with no quota, shown in place of usage-limit windows. `value` is the
 * provider's own display text; `usedPercent`, when set, draws a bar.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ServerProviderUsageStat = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  value: TrimmedNonEmptyString,
  usedPercent: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
  detail: Schema.optional(TrimmedNonEmptyString),
});
export type ServerProviderUsageStat = typeof ServerProviderUsageStat.Type;
