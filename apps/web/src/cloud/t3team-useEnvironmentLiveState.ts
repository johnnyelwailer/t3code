import { isSessionEndedFailure } from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useState } from "react";

import { environmentReconnectGraceMs } from "~/components/t3team-environmentReconnectBanner";
import { environmentCatalog } from "~/connection/catalog";
import { isDesktopLocalConnectionTarget } from "~/connection/desktopLocal";
import { useEnvironmentPresentation } from "~/state/presentation";

import {
  isReconnectingPhase,
  resolveEnvironmentLiveState,
  type EnvironmentLiveState,
} from "./t3team-environmentLiveState";

/**
 * Whether an environment's connection was parked because its cloud session ended. A boolean atom
 * derived from the supervisor state, so a row only re-renders when this flips — not on every
 * retry attempt the supervisor reports.
 */
const sessionEndedAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) => {
    const state = Option.getOrNull(
      AsyncResult.value(get(environmentCatalog.stateAtom(environmentId))),
    );
    return state !== null && state.phase === "blocked" && isSessionEndedFailure(state.lastFailure);
  }).pipe(Atom.withLabel(`t3team-session-ended:${environmentId}`)),
);

const NO_ENVIRONMENT_ATOM = Atom.make(false).pipe(Atom.withLabel("t3team-session-ended:none"));

/** True once `active` has held for `graceMs`; resets as soon as it stops holding. */
function useGraceElapsed(active: boolean, graceMs: number): boolean {
  const [grace, setGrace] = useState({ active: false, elapsed: false });
  if (grace.active !== active) setGrace({ active, elapsed: false });
  useEffect(() => {
    if (!active) return;
    const timeout = setTimeout(() => setGrace({ active: true, elapsed: true }), graceMs);
    return () => clearTimeout(timeout);
  }, [active, graceMs]);
  return active && grace.active && grace.elapsed;
}

export function useEnvironmentSessionEnded(environmentId: EnvironmentId | null): boolean {
  return useAtomValue(
    environmentId === null ? NO_ENVIRONMENT_ATOM : sessionEndedAtom(environmentId),
  );
}

/**
 * The live state of one environment, for surfaces that show a thread's running state. Unknown
 * environments read `live`: this only ever corrects a state, it never invents one.
 */
export function useEnvironmentLiveState(environmentId: EnvironmentId | null): EnvironmentLiveState {
  const { presentation } = useEnvironmentPresentation(environmentId);
  const sessionEnded = useEnvironmentSessionEnded(environmentId);
  const phase = presentation?.connection.phase ?? "connected";
  const target = presentation?.entry.target;
  const isLocal =
    target !== undefined &&
    (target._tag === "PrimaryConnectionTarget" || isDesktopLocalConnectionTarget(target));
  const graceElapsed = useGraceElapsed(
    isReconnectingPhase(phase),
    environmentReconnectGraceMs(isLocal),
  );
  return resolveEnvironmentLiveState({ phase, sessionEnded, graceElapsed });
}
