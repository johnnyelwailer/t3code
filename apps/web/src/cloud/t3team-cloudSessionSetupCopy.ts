/**
 * The words of the setup card that are not step labels: the rough time left and what it is based
 * on, the honest long-wait explanation, what the user can do meanwhile, and what assistive tech
 * hears. Pure.
 */
import type { CloudSetupModel } from "./t3team-cloudSessionSetupModel";

/** Says where the only time figure comes from, next to it. */
export const CLOUD_SETUP_ROUGH_BASIS = "Rough estimate, not measured for this session";

/** "About 2 min left". One rounded figure, never a range, never zero. */
export function formatCloudSetupRemaining(seconds: number): string {
  if (seconds <= 45) return "Less than a minute left";
  if (seconds <= 90) return "About a minute left";
  return `About ${Math.ceil(seconds / 60)} min left`;
}

/** What assistive tech hears: changes with the step, never with the clock. */
export function cloudSetupAnnouncement(model: CloudSetupModel): string {
  return model.stage === "ready"
    ? "Your cloud session is ready."
    : model.stage === "failed"
      ? "Cloud session setup failed."
      : model.activity;
}

/** The line under the title once the session is ready; only claims a connection that exists. */
export function cloudSetupReadyNote(model: CloudSetupModel): string {
  return model.machineConnected
    ? "Everything is in place. Send your first message to start."
    : "The machine is up. Send your first message to connect to it and start.";
}

/** The honest long-wait explanation, or null when the setup is the quick kind. */
export function cloudSetupLongWaitNote(model: CloudSetupModel): string | null {
  if (model.stage !== "working" || !model.longWait) return null;
  return "Your repository is being prepared: cloning it and installing its dependencies. This can take several minutes, and there is no time estimate for it yet.";
}

/** The one line about typing meanwhile; true to what the composer does. */
export function cloudSetupMeanwhileNote(model: CloudSetupModel): string | null {
  if (model.stage !== "working") return null;
  if (model.delivery === "sending") return null;
  return model.delivery === "queued"
    ? "Your message is waiting and will be sent as soon as the session is ready."
    : "You can already type: your first message is sent as soon as the session is ready.";
}
