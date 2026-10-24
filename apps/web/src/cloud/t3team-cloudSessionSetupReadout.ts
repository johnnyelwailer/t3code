import { presentCloudSession } from "~/components/cloud/t3team-cloudSessionProvisionPresentation";
import {
  cloudSetupAnnouncement,
  basisTextOf,
  formatCloudSetupRemaining,
} from "./t3team-cloudSessionSetupCopy";
import type { CloudSetupModel } from "./t3team-cloudSessionSetupModel";

export function cloudSetupElapsedSeconds(
  snapshot: number,
  snapshotAtMs: number,
  nowMs: number,
): number {
  return Math.max(0, snapshot + Math.max(0, nowMs - snapshotAtMs) / 1000);
}

export function readCloudSetup(model: CloudSetupModel, elapsedSeconds: number) {
  const working = model.stage === "working";
  const provisioning = model.session !== null && model.session.phase !== "ready";
  const slow = working && provisioning && elapsedSeconds > model.timing.readyHighSeconds;
  const remaining =
    working && provisioning && !slow
      ? {
          lowSeconds: Math.max(1, model.timing.readyLowSeconds - elapsedSeconds),
          highSeconds: Math.max(20, model.timing.readyHighSeconds - elapsedSeconds),
        }
      : null;
  const estimateText =
    model.session === null
      ? "Waiting for session status"
      : slow
        ? "Taking longer than usual"
        : remaining === null
          ? ""
          : formatCloudSetupRemaining(remaining.lowSeconds, remaining.highSeconds);
  const progress =
    model.session === null
      ? 0
      : (presentCloudSession({ ...model.session, elapsedSeconds }).progress ??
        (model.session.phase === "ready" ? 1 : 0));
  const announcement = cloudSetupAnnouncement(model);
  return {
    progress,
    slow,
    remaining,
    estimateText,
    basisText: working && provisioning ? basisTextOf(model) : null,
    announcement,
    valueText: `${model.activity} ${estimateText}`.trim(),
  };
}
