/**
 * Fork capability block on the environment descriptor
 * (`ExecutionEnvironmentCapabilities.t3team`). Upstream servers omit the whole
 * block, so clients treat a missing block or flag as "unsupported" and never
 * call the matching fork RPC under version skew.
 */
import * as Schema from "effect/Schema";

export const T3TeamEnvironmentCapabilities = Schema.Struct({
  /** Server streams fork thread facts (`t3team.subscribeThreadFacts`). */
  threadFacts: Schema.optionalKey(Schema.Boolean),
  /** Server streams fork thread artifacts (`t3team.subscribeThreadArtifacts`). */
  threadArtifacts: Schema.optionalKey(Schema.Boolean),
  /** Server serves "stop including sub-runs" (`t3team.stopThreadCascade`). */
  stopCascade: Schema.optionalKey(Schema.Boolean),
});
export type T3TeamEnvironmentCapabilities = typeof T3TeamEnvironmentCapabilities.Type;
