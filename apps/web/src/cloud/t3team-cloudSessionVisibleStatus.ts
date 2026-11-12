/** One visible cloud-session status. CloudSession.tla, ApplyFix = TRUE. */

const TERMINAL = new Set(["failed", "stopped", "cancelled"]);
const PROVISIONING = new Set([
  "creating",
  "requested",
  "queued",
  "preparing",
  "starting",
]);

export type CloudSessionQueuedRecord = "none" | "waiting" | "failed" | "sending";
export type CloudSessionConn = "live" | "connecting" | "offline" | "blocked";
export type CloudSessionSetupStage = "hidden" | "working" | "failed" | "ready";
export type CloudSessionVisibleKind = "none" | "setting_up" | "ended" | "offline";
export type CloudSessionPrimaryAction =
  | "none"
  | "retry"
  | "try_again"
  | "start_another"
  | "reconnect";
export type CloudSessionVisibleSurface = "setup" | "ended" | "clone" | "offline";

export interface CloudSessionVisibleFacts {
  readonly phase: string;
  readonly endedSticky: boolean;
  readonly startingAnother: boolean;
  readonly queued: CloudSessionQueuedRecord;
  readonly failureKind: string;
  readonly machineConnected: boolean;
  readonly projectReady: boolean;
  readonly providerReady: boolean;
  readonly cloneSuggested: boolean;
  readonly conn: CloudSessionConn;
}

export interface CloudSessionVisibleStatus {
  readonly kind: CloudSessionVisibleKind;
  readonly setupStage: CloudSessionSetupStage;
  readonly showSetupCard: boolean;
  readonly showEndedBanner: boolean;
  readonly showCloneBanner: boolean;
  readonly showOfflineBanner: boolean;
  readonly showQueuedBindBanner: boolean;
  readonly primary: CloudSessionPrimaryAction;
  readonly visible: ReadonlyArray<CloudSessionVisibleSurface>;
}

/** SetupCard. Branches follow the TLA operator in order. */
function cloudSessionSetupStage(
  facts: CloudSessionVisibleFacts,
): CloudSessionSetupStage {
  const { queued, phase, endedSticky } = facts;
  if (queued === "none" && (TERMINAL.has(phase) || phase === "none")) {
    return "hidden";
  }
  if (queued === "none" && !PROVISIONING.has(phase)) {
    return "hidden";
  }
  if (
    queued === "failed" ||
    (queued === "waiting" && TERMINAL.has(phase)) ||
    (queued === "waiting" &&
      endedSticky &&
      !PROVISIONING.has(phase) &&
      phase !== "ready")
  ) {
    return "failed";
  }
  if (phase === "ready" && queued === "none") {
    return "ready";
  }
  if (queued === "waiting" || queued === "sending" || PROVISIONING.has(phase)) {
    return "working";
  }
  return "hidden";
}

function sessionLooksDead(facts: CloudSessionVisibleFacts): boolean {
  if (TERMINAL.has(facts.phase)) return true;
  return (
    facts.endedSticky &&
    !facts.startingAnother &&
    !PROVISIONING.has(facts.phase) &&
    facts.phase !== "ready"
  );
}

function primaryAction(
  facts: CloudSessionVisibleFacts,
  setupStage: CloudSessionSetupStage,
  showEndedBanner: boolean,
  showOfflineBanner: boolean,
): CloudSessionPrimaryAction {
  if (setupStage === "failed") {
    return sessionLooksDead(facts) ? "try_again" : "retry";
  }
  if (showEndedBanner) return "start_another";
  if (showOfflineBanner && facts.conn === "offline") return "reconnect";
  return "none";
}

/** VisibleStatuses, EndedBannerFixed, CloneBannerFixed, OfflineBannerFixed. */
export function resolveCloudSessionVisibleStatus(
  facts: CloudSessionVisibleFacts,
): CloudSessionVisibleStatus {
  const setupStage = cloudSessionSetupStage(facts);
  const showSetupCard = setupStage !== "hidden";
  const showEndedBanner =
    facts.endedSticky && !showSetupCard && !facts.startingAnother;
  const showCloneBanner = false;
  const showOfflineBanner =
    (facts.conn === "connecting" || facts.conn === "offline") &&
    !showEndedBanner &&
    !showSetupCard;
  const visible: CloudSessionVisibleSurface[] = [];
  if (showSetupCard) visible.push("setup");
  if (showEndedBanner) visible.push("ended");
  if (showCloneBanner) visible.push("clone");
  if (showOfflineBanner) visible.push("offline");
  const kind: CloudSessionVisibleKind = showSetupCard
    ? "setting_up"
    : showEndedBanner
      ? "ended"
      : showOfflineBanner
        ? "offline"
        : "none";
  return {
    kind,
    setupStage,
    showSetupCard,
    showEndedBanner,
    showCloneBanner,
    showOfflineBanner,
    showQueuedBindBanner: facts.queued !== "none" && !showSetupCard,
    primary: primaryAction(facts, setupStage, showEndedBanner, showOfflineBanner),
    visible,
  };
}
