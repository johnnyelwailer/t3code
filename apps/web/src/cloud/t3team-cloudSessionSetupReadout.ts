import {
  formatDuration,
  presentCloudSession,
} from "~/components/cloud/t3team-cloudSessionProvisionPresentation";
import { CLOUD_SESSION_ROUGH_READY_SECONDS } from "~/components/cloud/t3team-cloudSessionProvisionTiming";
import {
  CLOUD_SETUP_ROUGH_BASIS,
  cloudSetupAnnouncement,
  formatCloudSetupRemaining,
} from "./t3team-cloudSessionSetupCopy";
import type { CloudSetupModel } from "./t3team-cloudSessionSetupModel";

/** The bar never looks finished while something is still being set up. */
const WORKING_PROGRESS_CEILING = 0.95;

export function cloudSetupElapsedSeconds(
  snapshot: number,
  snapshotAtMs: number,
  nowMs: number,
): number {
  return Math.max(0, snapshot + Math.max(0, nowMs - snapshotAtMs) / 1000);
}

/**
 * The clock-driven part of the card. The only time figure is the rough one measured for a plain
 * session, so a project machine or setup session gets its elapsed time and no estimate at all.
 */
export function readCloudSetup(model: CloudSetupModel, elapsedSeconds: number) {
  const working = model.stage === "working";
  const provisioning = model.session !== null && model.session.phase !== "ready";
  const estimating = working && provisioning && !model.longWait;
  const slow = estimating && elapsedSeconds > CLOUD_SESSION_ROUGH_READY_SECONDS;
  const remaining =
    estimating && !slow ? Math.max(1, CLOUD_SESSION_ROUGH_READY_SECONDS - elapsedSeconds) : null;
  const estimateText =
    model.session === null
      ? "Waiting for session status"
      : !working || !provisioning
        ? ""
        : model.longWait
          ? `${formatDuration(elapsedSeconds)} so far`
          : remaining === null
            ? "Taking longer than the rough estimate"
            : formatCloudSetupRemaining(remaining);
  const sessionProgress =
    model.session === null
      ? 0
      : (presentCloudSession({ ...model.session, elapsedSeconds }).progress ??
        (model.session.phase === "ready" ? 1 : 0));
  return {
    progress: working ? Math.min(sessionProgress, WORKING_PROGRESS_CEILING) : sessionProgress,
    slow,
    remaining,
    estimateText,
    basisText: remaining === null ? null : CLOUD_SETUP_ROUGH_BASIS,
    announcement: cloudSetupAnnouncement(model),
    valueText: `${model.activity} ${estimateText}`.trim(),
  };
}
