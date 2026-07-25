import type {
  EnvironmentId,
  ExecutionEnvironmentDescriptor,
  PersistedSavedEnvironmentRecord,
  ServerConfig,
} from "@t3tools/contracts";
import { create } from "zustand";

export interface ProjectShellEnvironmentRecord {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly wsBaseUrl: string;
  readonly httpBaseUrl: string;
  readonly createdAt: string;
  readonly lastConnectedAt: string | null;
  readonly desktopSsh?: PersistedSavedEnvironmentRecord["desktopSsh"];
}

interface ProjectShellEnvironmentStoreState {
  readonly environments: Record<EnvironmentId, ProjectShellEnvironmentRecord>;
  readonly activeEnvironmentId: EnvironmentId | null;
}

interface ProjectShellEnvironmentStore extends ProjectShellEnvironmentStoreState {
  readonly setActiveEnvironment: (environmentId: EnvironmentId | null) => void;
  readonly upsertEnvironment: (record: ProjectShellEnvironmentRecord) => void;
  readonly removeEnvironment: (environmentId: EnvironmentId) => void;
  readonly reset: () => void;
}

export const useProjectShellEnvironmentStore = create<ProjectShellEnvironmentStore>()((set) => ({
  environments: {},
  activeEnvironmentId: null,
  setActiveEnvironment: (environmentId) => set({ activeEnvironmentId: environmentId }),
  upsertEnvironment: (record) =>
    set((state) => ({
      environments: {
        ...state.environments,
        [record.environmentId]: record,
      },
    })),
  removeEnvironment: (environmentId) =>
    set((state) => {
      const { [environmentId]: _removed, ...remaining } = state.environments;
      return {
        environments: remaining,
        activeEnvironmentId:
          state.activeEnvironmentId === environmentId ? null : state.activeEnvironmentId,
      };
    }),
  reset: () =>
    set({
      environments: {},
      activeEnvironmentId: null,
    }),
}));

export interface ProjectShellServerState {
  readonly connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  readonly serverConfig: ServerConfig | null;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly error: string | null;
}

export interface ProjectShellAuthState {
  readonly status: "checking" | "authenticated" | "unauthenticated";
  // Upstream replaced AuthSessionRole with scope-based authorization; keep the
  // legacy literal shape until the project shell adopts scopes.
  readonly role: "owner" | "client" | null;
  readonly descriptor: ExecutionEnvironmentDescriptor | null;
}

export interface ProjectShellServerStore {
  readonly connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  readonly serverConfig: ServerConfig | null;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly error: string | null;
  readonly setConnectionStatus: (status: ProjectShellServerStore["connectionStatus"]) => void;
  readonly setServerConfig: (config: ServerConfig | null) => void;
  readonly setProviders: (providers: ReadonlyArray<ServerProvider>) => void;
  readonly setError: (error: string | null) => void;
}

import type { ServerProvider } from "@t3tools/contracts";

export const useProjectShellServerStore = create<ProjectShellServerStore>()((set) => ({
  connectionStatus: "disconnected",
  serverConfig: null,
  providers: [],
  error: null,
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setServerConfig: (serverConfig) => set({ serverConfig }),
  setProviders: (providers) => set({ providers }),
  setError: (error) => set({ error }),
}));
