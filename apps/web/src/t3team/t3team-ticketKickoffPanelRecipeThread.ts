import type { T3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import type { T3TeamKickoffPanelKickoff } from "~/t3team/t3team-TicketKickoffPanelFooter";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

/**
 * Starts the thread a side-panel recipe card asked for.
 *
 * Pending is left unset on purpose. The factory then stores `kickoffPending: true`, and the
 * mounted chat sends `kickoffMessage`. The sidecar launcher only sends when this returns a thread
 * id; the ticket aside's kickoff handler does not, so the two paths cannot both launch.
 */
export function requestTicketKickoffPanelRecipeThread(input: {
  readonly onKickoff: T3TeamKickoffPanelKickoff;
  readonly kickoffMessage: string;
  readonly kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  readonly launchConfig: T3TeamKickoffLaunchConfig;
  readonly contextAttachments: ReadonlyArray<T3TeamContextAttachment>;
}) {
  return input.onKickoff(
    input.kickoffMessage,
    undefined,
    input.launchConfig.selection,
    input.launchConfig.runtimeMode,
    input.launchConfig.interactionMode,
    input.launchConfig.selectedToolIds,
    input.contextAttachments,
    input.kickoffWorkflow,
  );
}
