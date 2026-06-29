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
    enabled: backend === null,
    isConnected,
    serverConfig,
  });

  return (
    backend?.state ?? {
      connectionStatus: isConnected
        ? "connected"
        : connectionUiState === "connecting" || connectionUiState === "reconnecting"
          ? "connecting"
          : "error",
      serverConfig,
      providers: serverConfig?.providers ?? [],
      error: wsStatus.lastError,
    }
  );
}
