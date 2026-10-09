import { createContext, useContext } from "react";
import { useEnsurePrimaryProvidersRefreshed, useServerConfig } from "~/t3team/t3team-serverState";
import {
  getWsConnectionUiState,
  useWsConnectionStatus,
  type WsConnectionUiState,
} from "~/t3team/t3team-wsConnection";
import type { BackendApi, BackendState, ConnectionStatus } from "./t3team-types";

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

/** Map the live WS UI phase onto BackendState.connectionStatus (same ladder both paths use). */
export function resolveBackendConnectionStatus(
  connectionUiState: WsConnectionUiState,
): ConnectionStatus {
  if (connectionUiState === "connected") return "connected";
  if (connectionUiState === "connecting" || connectionUiState === "reconnecting") {
    return "connecting";
  }
  if (connectionUiState === "offline") return "disconnected";
  return "error";
}

export function useBackendState(): BackendState {
  const backend = useBackend();
  const serverConfig = useServerConfig();
  const wsStatus = useWsConnectionStatus();
  const connectionUiState = getWsConnectionUiState(wsStatus);
  const isConnected = connectionUiState === "connected";
  const connectionStatus = resolveBackendConnectionStatus(connectionUiState);

  useEnsurePrimaryProvidersRefreshed({
    enabled: true,
    isConnected,
    serverConfig,
  });

  const providers = serverConfig?.providers ?? [];

  if (backend) {
    // backend.state.providers and connectionStatus are snapshotted inside connect(), which runs
    // on mount before the WS/server-config projections settle, and never notify React afterward.
    // Source both from the reactive atoms so the kickoff composer stops showing "Server is
    // disconnected" / "Loading provider status..." while the thread composer is already live.
    return {
      ...backend.state,
      serverConfig,
      providers,
      connectionStatus,
      error: wsStatus.lastError ?? backend.state.error,
    };
  }

  return {
    connectionStatus,
    serverConfig,
    providers,
    error: wsStatus.lastError,
  };
}
