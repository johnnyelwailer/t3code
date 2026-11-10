/**
 * Live statistics a provider reports instead of a quota (for example a self-hosted gateway's
 * running requests). Published on `ServerProvider.usageStats`; the thread details "Usage limits"
 * section shows them in place of limit windows. `value` is display text from the provider's own
 * data; `usedPercent`, when set, draws a bar.
 *
 * @module t3team-providerUsageStats
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
