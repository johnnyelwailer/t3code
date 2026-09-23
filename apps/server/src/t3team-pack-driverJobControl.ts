/**
 * Out-of-band background-job control on the pack adapter bridge.
 *
 * The pack surface's `jobControl` (list / cancel / read retained output) is
 * OPTIONAL: a runtime that keeps no jobs omits it. Absence maps to
 * "not supported" — the adapter advertises no capability and exposes no
 * method, so the host's capability check (never a swallowed call) decides.
 * When present, the Promise method becomes an Effect and rejections map to
 * `ProviderAdapterRequestError` exactly like every other pack method call.
 * `unknown-job` is a RESULT, not an error: the pack settles it, the host
 * only settles transport failures.
 *
 * Split from t3team-pack-driverAdapter.ts by the LOC cap: the forwarder is
 * one focused seam with no business of its own.
 *
 * @module t3team-pack-driverJobControl
 */
import type {
  ProviderDriverKind,
  ProviderJobControlRequest,
  ProviderJobControlResult,
  ThreadId,
} from "@t3tools/contracts";
import type { PackProviderInstance } from "@t3team/packs";
import * as Effect from "effect/Effect";

import { ProviderAdapterRequestError, type ProviderAdapterError } from "./provider/Errors.ts";
import type { ProviderAdapterShape } from "./provider/Services/ProviderAdapter.ts";

export type PackJobControlMethod = PackProviderInstance["jobControl"];

export const makePackJobControl = (input: {
  readonly packInstance: PackProviderInstance;
  readonly driverKind: ProviderDriverKind;
  readonly method?: PackJobControlMethod;
}): ProviderAdapterShape<ProviderAdapterError>["jobControl"] | undefined => {
  const { packInstance, driverKind, method } = input;
  if (method === undefined) return undefined;
  return (threadId: ThreadId, request: ProviderJobControlRequest) =>
    Effect.tryPromise({
      try: (): Promise<ProviderJobControlResult> => method.call(packInstance, threadId, request),
      catch: (cause: unknown) =>
        new ProviderAdapterRequestError({
          provider: driverKind,
          method: "jobControl",
          detail: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    });
};
