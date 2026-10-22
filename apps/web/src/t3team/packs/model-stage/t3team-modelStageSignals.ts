/**
 * The live inputs of `selectModelStageTier`, each one store shared by every stage on the page:
 * battery (`navigator.getBattery`, where the browser has it), the desktop shell's power state
 * (`desktopBridge.getPowerState`, absent in a browser), WebGL support, and the session's
 * first-frames probe results. Nothing here polls: every store is pushed to.
 */
import type { DesktopPowerState } from "@t3tools/contracts";
import type { ModelStageTier } from "@t3team/pack-ui/contract";
import { useSyncExternalStore } from "react";

import type { ModelStageSignals } from "./t3team-modelStageTier";

type Listener = () => void;

/** A tiny push store: a value, its listeners, and a lazy `start` run on the first subscriber. */
function createStore<T>(initial: T, start: (set: (value: T) => void) => void) {
  let value = initial;
  let started = false;
  const listeners = new Set<Listener>();
  const set = (next: T) => {
    if (Object.is(next, value)) return;
    value = next;
    for (const listener of listeners) listener();
  };
  return {
    get: () => value,
    set,
    subscribe(listener: Listener) {
      listeners.add(listener);
      if (!started) {
        started = true;
        start(set);
      }
      return () => listeners.delete(listener);
    },
  };
}

interface BatteryManagerLike extends EventTarget {
  readonly charging: boolean;
  readonly level: number;
}

const batteryStore = createStore<ModelStageSignals["battery"]>(null, (set) => {
  const getBattery = (
    navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }
  ).getBattery?.bind(navigator);
  if (!getBattery) return;
  void getBattery()
    .then((battery) => {
      const read = () => set({ charging: battery.charging, level: battery.level });
      read();
      battery.addEventListener("chargingchange", read);
      battery.addEventListener("levelchange", read);
    })
    .catch(() => {
      // Not allowed here (a permissions policy): stay unknown.
    });
});

const powerStore = createStore<DesktopPowerState | null>(null, (set) => {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  if (!bridge?.getPowerState) return;
  bridge.onPowerStateChange?.(set);
  void bridge
    .getPowerState()
    .then(set)
    .catch(() => {
      // An older shell without the channel: stay unknown.
    });
});

type ProbeResults = ModelStageSignals["probeMs"];
const probeStore = createStore<ProbeResults>({}, () => {});

/** Records the mean frame time of a tier's first frames, once per tier per session. */
export function recordModelStageProbe(tier: "full" | "low", ms: number) {
  const current = probeStore.get();
  if (current[tier] !== undefined) return;
  probeStore.set({ ...current, [tier]: ms });
}

/** Whether this tier was already probed this session (a later stage does not probe again). */
export function modelStageProbed(tier: ModelStageTier): boolean {
  return tier === "full" || tier === "low" ? probeStore.get()[tier] !== undefined : true;
}

let webglSupport: boolean | undefined;
/** Whether a WebGL context can be made at all, asked once. */
export function hasWebGL(): boolean {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    webglSupport = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** Test seam: forget the cached answers so a test can set the stage up again. */
export function resetModelStageSignalsForTest() {
  webglSupport = undefined;
  probeStore.set({});
  batteryStore.set(null);
  powerStore.set(null);
}

const getNull = () => null;
const getEmpty = (): ProbeResults => ({});

export function useBatteryState() {
  return useSyncExternalStore(batteryStore.subscribe, batteryStore.get, getNull);
}
export function useDesktopPowerState() {
  return useSyncExternalStore(powerStore.subscribe, powerStore.get, getNull);
}
export function useModelStageProbes() {
  return useSyncExternalStore(probeStore.subscribe, probeStore.get, getEmpty);
}
