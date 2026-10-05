/**
 * Background-work probes of a pack session runtime. The session manager defers idle release and
 * the run executor holds a root run's subscription open while they report pending work. A probe
 * that fails reads as "no pending work" (logged), never as a failed session.
 *
 * @module t3team-pack-driverSessionProbes
 */
import type { PackSessionRuntime } from "@t3team/pack-api";
import type { ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  ProviderAdapterProtocolError,
  type ProviderAdapterV2SessionRuntime,
} from "./orchestration-v2/ProviderAdapter.ts";
import { packCall } from "./t3team-pack-driverCall.ts";
import { asPack, PackCodec } from "./t3team-pack-driverCodec.ts";

type Probes = Pick<
  ProviderAdapterV2SessionRuntime,
  "hasPendingBackgroundWork" | "hasPendingBackgroundWorkForThread"
>;

const probe = <E>(driver: ProviderDriverKind, check: Effect.Effect<boolean, E>) =>
  check.pipe(
    Effect.map((pending) => pending === true),
    Effect.catch((cause) =>
      Effect.logWarning("Pack provider background-work probe failed", { driver, cause }).pipe(
        Effect.as(false),
      ),
    ),
  );

/** Only the probes the pack implements; an absent one stays absent ("never pending"). */
export const makePackSessionProbes = (
  runtime: PackSessionRuntime,
  driver: ProviderDriverKind,
): Probes => {
  const probeCall = packCall(
    (cause) =>
      new ProviderAdapterProtocolError({ driver, detail: "background-work probe failed", cause }),
  );
  const pending = runtime.hasPendingBackgroundWork;
  const pendingForThread = runtime.hasPendingBackgroundWorkForThread;
  return {
    ...(pending === undefined
      ? {}
      : {
          hasPendingBackgroundWork: probe(
            driver,
            probeCall.call(() => pending.call(runtime)),
          ),
        }),
    ...(pendingForThread === undefined
      ? {}
      : {
          hasPendingBackgroundWorkForThread: (providerThread) =>
            probe(
              driver,
              probeCall
                .encode(PackCodec.providerThread, providerThread)
                .pipe(
                  Effect.flatMap((encoded) =>
                    probeCall.call(() => pendingForThread.call(runtime, asPack(encoded))),
                  ),
                ),
            ),
        }),
  };
};
