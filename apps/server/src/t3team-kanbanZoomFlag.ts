/**
 * Runtime feature flag: semantic zoom on the My Work kanban board (three card-density levels,
 * steered from the toolbar or Ctrl/Cmd+wheel / trackpad pinch).
 *
 * The server advertises the flag to clients through `ServerConfig.featureFlags` and, for older
 * clients, `ServerConfig.kanbanSemanticZoom`.
 *
 * Layering: `NEXI_FF_KANBAN_SEMANTIC_ZOOM` env override > feature_flags user value > release
 * preset > code default (off). Off: the zoom control is hidden, the wheel handler is inert, and
 * the board renders the full-detail layout. Read live on every call.
 */

import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

/** Environment override for the semantic-zoom flag. */
export const KANBAN_SEMANTIC_ZOOM_FLAG_ENV = "NEXI_FF_KANBAN_SEMANTIC_ZOOM";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isKanbanSemanticZoomEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("KANBAN_SEMANTIC_ZOOM", readEnv);
}
