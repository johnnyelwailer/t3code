/**
 * Gathers visible-status facts for the open thread and runs the reducer.
 * If the setup card is already on screen, banners stay down even when facts
 * are slightly behind (InvNoEndedAndSettingUp).
 */
import type { EnvironmentId } from "@t3tools/contracts";

import { useEnvironments } from "~/state/environments";

import type { CloudSessionSetupCardProps } from "./t3team-CloudSessionSetupCard";
import { useEnvironmentSessionEnded } from "./t3team-useEnvironmentLiveState";
import { withLiveSetupCard } from "./t3team-cloudSessionBannerPolicy";
import {
  resolveCloudSessionVisibleStatus,
  type CloudSessionConn,
  type CloudSessionQueuedRecord,
  type CloudSessionVisibleStatus,
} from "./t3team-cloudSessionVisibleStatus";

const PROVISIONING = new Set(["creating", "requested", "queued", "preparing", "starting"]);

function connFromEnvironmentPhase(
  phase: string | undefined,
  endedSticky: boolean,
): CloudSessionConn {
  if (phase === "connecting" || phase === "reconnecting") return "connecting";
  if (phase === "disconnected" || phase === "unavailable" || phase === "offline") {
    return endedSticky ? "blocked" : "offline";
  }
  if (endedSticky && (phase === undefined || phase === "blocked")) return "blocked";
  return "live";
}

function queuedRecordFromSetup(card: CloudSessionSetupCardProps | null): CloudSessionQueuedRecord {
  if (card === null) return "none";
  if (card.facts.delivery === "sending") return "sending";
  const queued = card.facts.queued;
  if (queued == null) return "none";
  if (queued.failureMessage !== undefined || card.facts.sendFailure != null) return "failed";
  return "waiting";
}

export function useCloudSessionVisibleStatus(input: {
  readonly environmentId: EnvironmentId | null;
  readonly setupCard: CloudSessionSetupCardProps | null;
  readonly createPending: boolean;
  readonly cloneSuggested: boolean;
}): CloudSessionVisibleStatus {
  const endedSticky = useEnvironmentSessionEnded(input.environmentId);
  const { environments } = useEnvironments();
  const env = environments.find((item) => item.environmentId === input.environmentId);
  const session = input.setupCard?.facts.session;
  const phase = session?.phase ?? (input.createPending ? "creating" : "none");
  const startingAnother = input.createPending || PROVISIONING.has(phase);
  const status = resolveCloudSessionVisibleStatus({
    phase,
    endedSticky,
    startingAnother,
    queued: queuedRecordFromSetup(input.setupCard),
    failureKind: input.setupCard?.facts.queued?.failureMessage !== undefined ? "other" : "none",
    machineConnected: input.setupCard?.facts.machineConnected ?? false,
    projectReady: input.setupCard?.facts.projectReady ?? false,
    providerReady: input.setupCard?.facts.providerReady ?? false,
    cloneSuggested: input.cloneSuggested,
    conn: connFromEnvironmentPhase(env?.connection.phase, endedSticky),
  });
  return withLiveSetupCard(status, input.setupCard !== null);
}
