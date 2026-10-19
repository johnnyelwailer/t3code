/**
 * What the backend's liveness beacon says about a backend that stopped answering HTTP.
 *
 * The backend writes a `DesktopBackendLivenessBeacon` about once a second from a worker thread
 * (`apps/server/src/t3team-livenessBeacon.ts`), so beacons keep arriving while its event loop is
 * blocked. When health probes fail, the watchdog asks for a verdict:
 *
 * - `busy`: beacons are fresh and the event loop stalled for seconds recently. The backend is
 *   alive and working through a burst; the watchdog waits, within its busy grace.
 * - `wedged`: beacons are fresh and the event loop turns, yet HTTP does not answer.
 * - `frozen`: beacons stopped. The whole process is hung or gone.
 * - `no-signal`: no beacon ever arrived (no liveness pipe, e.g. WSL, or an older backend).
 *
 * Everything but `busy` is killed as before.
 */
import { DesktopBackendLivenessBeacon } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

export type BackendLivenessVerdict =
  | { readonly kind: "busy"; readonly maxStallMs: number }
  | { readonly kind: "wedged"; readonly maxStallMs: number }
  | { readonly kind: "frozen"; readonly beaconAgeMs: number }
  | { readonly kind: "no-signal" };

export interface BackendLivenessConfig {
  /** A beacon older than this means the process stopped writing them. */
  readonly staleAfter: Duration.Duration;
  /** A recent event-loop stall at least this long means the backend is busy. */
  readonly busyStall: Duration.Duration;
}

const DEFAULT_BACKEND_LIVENESS_CONFIG: BackendLivenessConfig = {
  staleAfter: Duration.seconds(5),
  busyStall: Duration.seconds(1),
};

interface ReceivedBeacon {
  readonly receivedAtMs: number;
  readonly beacon: DesktopBackendLivenessBeacon;
}

const classifyBackendLiveness = (
  latest: Option.Option<ReceivedBeacon>,
  nowMs: number,
  config: BackendLivenessConfig,
): BackendLivenessVerdict => {
  if (Option.isNone(latest)) return { kind: "no-signal" };
  const { receivedAtMs, beacon } = latest.value;
  const beaconAgeMs = nowMs - receivedAtMs;
  if (beaconAgeMs > Duration.toMillis(config.staleAfter)) return { kind: "frozen", beaconAgeMs };
  const maxStallMs = Math.max(beacon.maxStallMs, beacon.stalledForMs);
  return maxStallMs >= Duration.toMillis(config.busyStall)
    ? { kind: "busy", maxStallMs }
    : { kind: "wedged", maxStallMs };
};

export const describeBackendLiveness = (verdict: BackendLivenessVerdict): string => {
  switch (verdict.kind) {
    case "busy":
      return `event loop busy (stalled up to ${verdict.maxStallMs}ms recently)`;
    case "wedged":
      return `event loop turning (stalls under ${verdict.maxStallMs + 1}ms) but HTTP not answering`;
    case "frozen":
      return `process frozen or gone (no liveness beacon for ${verdict.beaconAgeMs}ms)`;
    case "no-signal":
      return "no liveness beacon from this backend";
  }
};

export interface BackendLiveness {
  readonly record: (beacon: DesktopBackendLivenessBeacon) => Effect.Effect<void>;
  readonly assess: Effect.Effect<BackendLivenessVerdict>;
}

export const backendLivenessUnavailable: BackendLiveness = {
  record: () => Effect.void,
  assess: Effect.succeed({ kind: "no-signal" }),
};

export const makeBackendLiveness = (
  config: BackendLivenessConfig = DEFAULT_BACKEND_LIVENESS_CONFIG,
): Effect.Effect<BackendLiveness> =>
  Effect.map(Ref.make(Option.none<ReceivedBeacon>()), (latest) => ({
    record: (beacon) =>
      Effect.flatMap(Clock.currentTimeMillis, (receivedAtMs) =>
        Ref.set(latest, Option.some({ receivedAtMs, beacon })),
      ),
    assess: Effect.zipWith(Ref.get(latest), Clock.currentTimeMillis, (received, nowMs) =>
      classifyBackendLiveness(received, nowMs, config),
    ),
  }));

const decodeBeaconLine = Schema.decodeUnknownEffect(
  Schema.fromJsonString(DesktopBackendLivenessBeacon),
);

/** Records every beacon line the backend writes to its liveness pipe; skips malformed ones. */
export const recordBackendLivenessStream = <E, R>(
  output: Stream.Stream<Uint8Array, E, R>,
  liveness: BackendLiveness,
): Effect.Effect<void, E, R> =>
  output.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.filter((line) => line.length > 0),
    Stream.runForEach((line) =>
      decodeBeaconLine(line).pipe(Effect.flatMap(liveness.record), Effect.ignore),
    ),
  );

/** Liveness for one backend run, fed from its liveness pipe when it has one. */
export const forkBackendLivenessReader = <E>(
  output: Stream.Stream<Uint8Array, E> | undefined,
): Effect.Effect<BackendLiveness, never, Scope.Scope> =>
  output === undefined
    ? Effect.succeed(backendLivenessUnavailable)
    : Effect.tap(makeBackendLiveness(), (liveness) =>
        recordBackendLivenessStream(output, liveness).pipe(Effect.ignore, Effect.forkScoped),
      );
