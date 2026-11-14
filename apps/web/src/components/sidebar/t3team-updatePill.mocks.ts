import type { DesktopUpdateState } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { useSyncExternalStore } from "react";
import { vi } from "vite-plus/test";

import type { ServerUpdateTarget } from "../ServerUpdateAction";
import type { UpdateEverythingRow } from "./updateEverything.logic";

const listeners = new Set<() => void>();
const current: { update: DesktopUpdateState | null } = { update: null };

export const VERSION = "0.0.50-nightly.2";
export const RUNNING_THREADS_PER_MACHINE = 2;

export const mocks = {
  hasUpdates: false,
  flag: false,
  rows: new Array<UpdateEverythingRow>(),
  servers: new Array<ServerUpdateTarget>(),
  runEverything: vi.fn(),
  confirm: vi.fn(),
  updateServer: vi.fn(),
  updateProvider: vi.fn(),
  claude: { driver: "claudeAgent" },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const mockedModules = {
  desktopUpdate: <T extends object>(original: T) => ({
    ...original,
    useDesktopUpdateState: () => useSyncExternalStore(subscribe, () => current.update),
  }),
  env: <T extends object>(original: T) => ({ ...original, isElectron: true }),
  updateEverything: () => ({
    useUpdateEverything: () => ({
      hasUpdates: mocks.hasUpdates,
      summary: "Update everything",
      version: null,
      providerCount: 0,
      rows: mocks.rows,
      restarts: [],
      servers: mocks.servers,
      run: mocks.runEverything,
    }),
  }),
  localApi: () => ({ ensureLocalApi: () => ({ dialogs: { confirm: mocks.confirm } }) }),
  featureFlag: () => ({
    useFeatureFlag: (key: string) => key === "UI_UPDATE_BADGE_ROW_ACTIONS" && mocks.flag,
  }),
  serverUpdate: <T extends object>(original: T) => ({
    ...original,
    useServerUpdate: () => mocks.updateServer,
  }),
  providerEntryUpdate: () => ({
    useProviderEntryUpdate: () => ({
      machines: [{ environmentId: "env-box", label: "build-box", candidates: [mocks.claude] }],
      update: mocks.updateProvider,
    }),
  }),
  updateDialog: <T extends object>(original: T) => ({
    ...original,
    runningThreadCountAtom: Atom.family((ids: string) =>
      Atom.make(ids.split("\n").filter((id) => id !== "").length * RUNNING_THREADS_PER_MACHINE),
    ),
  }),
};

export function setCurrentUpdate(state: DesktopUpdateState | null) {
  current.update = state;
}

/** Hands out a fresh snapshot, so subscribers render again with the current mocks. */
export function notifyUpdateListeners() {
  current.update = current.update === null ? null : { ...current.update };
  for (const listener of listeners) listener();
}
