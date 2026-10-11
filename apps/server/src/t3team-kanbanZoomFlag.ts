/**
 * Runtime feature flag: semantic zoom on the My Work kanban board (three card-density levels,
 * steered from the toolbar or Ctrl/Cmd+wheel / trackpad pinch).
 *
 * The server advertises the flag to clients through `ServerConfig.kanbanSemanticZoom`.
 *
 * Layering (owner flag rule): `NEXI_FF_KANBAN_SEMANTIC_ZOOM` env override > code default.
 * Default OFF: the zoom control is hidden, the wheel handler is inert, and the board renders
 * the legacy full-detail layout until the flag has been observed on.
 */

/** Environment override for the semantic-zoom flag. `1`/`true`/`on` on, anything else off. */
export const KANBAN_SEMANTIC_ZOOM_FLAG_ENV = "NEXI_FF_KANBAN_SEMANTIC_ZOOM";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isKanbanSemanticZoomEnabled(readEnv: ReadEnv = processEnv): boolean {
  const raw = readEnv(KANBAN_SEMANTIC_ZOOM_FLAG_ENV)?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
