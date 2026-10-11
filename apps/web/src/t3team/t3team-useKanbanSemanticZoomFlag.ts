import { useServerConfig } from "~/t3team/t3team-serverState";

/**
 * Server-advertised feature flag for semantic zoom on the My Work kanban board
 * (env `NEXI_FF_KANBAN_SEMANTIC_ZOOM`, advertised as `ServerConfig.kanbanSemanticZoom`).
 *
 * When false the zoom control is absent, the wheel/pinch handler is inert, and the board
 * renders the "full" level regardless of any persisted value.
 */
export function useKanbanSemanticZoomFlag(): boolean {
  return useServerConfig()?.kanbanSemanticZoom === true;
}
