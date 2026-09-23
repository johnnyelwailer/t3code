/** T3Team's capability-policy adapter for the durable `watermark` cursor. */

import {
  createWatermarkPrimitives as createGenericWatermarkPrimitives,
  type WatermarkPrimitives,
} from "@runbook/core/watermark";
import type { CheckpointPrimitives, CheckpointRecord } from "@runbook/core/checkpoint";
import { PermissionDeniedError } from "./t3team-sdk.errors.ts";
import { assertSignalName } from "./t3team-sdk.signal.ts";

export type { WatermarkPrimitives };

/**
 * A watermark is the cursor over a signal source, so it reuses the source's capability:
 * `watermark(key)` requires `"source:<key>"`, the same gate `getSignalSource` applies.
 */
export function createWatermarkPrimitives(deps: {
  readonly checkpoint: CheckpointPrimitives["checkpoint"];
  readonly resume: CheckpointRecord | undefined;
  readonly now: () => number;
  readonly capabilities: ReadonlySet<string>;
}): WatermarkPrimitives {
  const generic = createGenericWatermarkPrimitives({
    checkpoint: deps.checkpoint,
    resume: deps.resume,
    now: deps.now,
    isAllowed: (sourceKey) => deps.capabilities.has(`source:${sourceKey}`),
    denied: (sourceKey) =>
      new PermissionDeniedError(
        `'watermark(${sourceKey})' requires the 'source:${sourceKey}' capability. Add ` +
          `'source:${sourceKey}' to this workflow's meta.capabilities.`,
      ),
  });
  return {
    checkpoint: generic.checkpoint,
    watermark: (sourceKey, opts) => {
      assertSignalName(sourceKey);
      return generic.watermark(sourceKey, opts);
    },
  };
}
