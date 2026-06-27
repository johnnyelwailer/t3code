import { usePrimaryEnvironment } from "~/state/environments";

export type WsConnectionUiState = "connected" | "connecting" | "error" | "offline" | "reconnecting";

export interface WsConnectionStatus {
  readonly lastError: string | null;
}

export function getWsConnectionUiState(status: WsConnectionStatus): WsConnectionUiState {
  if (status.lastError) {
    return "error";
  }
  return "connected";
}

export function useWsConnectionStatus(): WsConnectionStatus {
  const environment = usePrimaryEnvironment();
  if (!environment) {
    return { lastError: "No environment connected" };
  }

  if (environment.connection.phase === "connected") {
    return { lastError: null };
  }

  if (
    environment.connection.phase === "connecting" ||
    environment.connection.phase === "available"
  ) {
    return { lastError: null };
  }

  return { lastError: environment.connection.error ?? "Disconnected" };
}
