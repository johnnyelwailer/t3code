import { useServerConfig } from "~/t3team/t3team-serverState";
import { readServerFeatureFlag, readServerFeatureFlagOr } from "~/t3team/t3team-useFeatureFlag";

/**
 * Semantic zoom on the My Work kanban board (`KANBAN_SEMANTIC_ZOOM`, read from the live
 * `ServerConfig.featureFlags`; a server that predates the map advertises
 * `ServerConfig.kanbanSemanticZoom`). Zoom is part of the board, so it is off with `MYWORK_KANBAN`.
 *
 * When false the zoom control is absent, the wheel/pinch handler is inert, and the board
 * renders the "full" level regardless of any persisted value.
 */
export function useKanbanSemanticZoomFlag(): boolean {
  const config = useServerConfig();
  return (
    readServerFeatureFlag(config, "MYWORK_KANBAN") &&
    readServerFeatureFlagOr(config, "KANBAN_SEMANTIC_ZOOM", config?.kanbanSemanticZoom === true)
  );
}
