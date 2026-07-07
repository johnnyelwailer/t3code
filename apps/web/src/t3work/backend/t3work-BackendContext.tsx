import { createContext, useContext } from "react";
import { useEnsurePrimaryProvidersRefreshed, useServerConfig } from "~/t3work/t3work-serverState";
import { getWsConnectionUiState, useWsConnectionStatus } from "~/t3work/t3work-wsConnection";
import type { BackendApi, BackendState } from "./t3work-types";

export const BackendContext = createContext<BackendApi | null>(null);

export interface BackendProviderProps {
  readonly backend: BackendApi;
  readonly children: React.ReactNode;
}

export function BackendProvider({ backend, children }: BackendProviderProps) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendApi | null {
  return useContext(BackendContext);
}

export function useBackendState(): BackendState {
  const backend = useBackend();
  const serverConfig = useServerConfig();
  const wsStatus = useWsConnectionStatus();
  const connectionUiState = getWsConnectionUiState(wsStatus);
  const isConnected = connectionUiState === "connected";

  useEnsurePrimaryProvidersRefreshed({
    enabled: true,
    isConnected,
    serverConfig,
  });

  const providers = serverConfig?.providers ?? [];

  if (backend) {
    // backend.state.providers is snapshotted once inside connect(), which runs on mount
    // before the server config projection has resolved providers, and never updates
    // afterward. Source providers (and serverConfig) from the reactive atom so the composer
    // stops showing "Loading provider status..." once providers arrive — without needing a
    // remount via Settings.
    return { ...backend.state, serverConfig, providers };
  }

  return {
    connectionStatus: isConnected
      ? "connected"
      : connectionUiState === "connecting" || connectionUiState === "reconnecting"
        ? "connecting"
        : "error",
    serverConfig,
    providers,
    error: wsStatus.lastError,
  };
}
