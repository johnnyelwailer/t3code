/**
 * "Sweep now" for the resource-pressure view (flag `NEXI_FF_RESOURCE_PRESSURE`):
 * runs the EXISTING policy-driven storage sweep (`StorageCleanup` — the user's
 * worktree cleanup rules plus browser-artifact/log retention) immediately
 * instead of waiting for the hourly pass. It adds no deletion logic of its own:
 * what gets removed is exactly what the configured rules already allow.
 *
 * @module t3team-resourcePressureSweep
 */
import type { ResourcePressureSweepResult } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { StorageCleanup } from "./storageCleanup.ts";
import { isResourcePressureEnabled } from "./t3team-resourcePressureFlag.ts";

export const sweepStorageNow = (
  storageCleanup: Option.Option<StorageCleanup["Service"]>,
  enabled: boolean = isResourcePressureEnabled(),
): Effect.Effect<ResourcePressureSweepResult> => {
  if (!enabled) {
    return Effect.succeed({
      swept: false,
      message: "Resource pressure tools are disabled (NEXI_FF_RESOURCE_PRESSURE).",
    });
  }
  if (Option.isNone(storageCleanup)) {
    return Effect.succeed({
      swept: false,
      message: "Storage cleanup is not available in this runtime.",
    });
  }
  return storageCleanup.value.sweepNow.pipe(
    Effect.as({
      swept: true,
      message: "Storage sweep ran with your worktree and file cleanup rules.",
    }),
  );
};
