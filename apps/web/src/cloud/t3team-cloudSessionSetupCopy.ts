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
  if (model.stage === "ready") return "Your cloud session is ready.";
  if (model.stage === "failed") return "Cloud session setup failed.";
  // The step list already names the current step; keep the live region short.
  if (model.delivery === "sending") return "Sending your message.";
  return model.activity;
}

/** The line under the title once the session is ready; only claims a connection that exists. */
export function cloudSetupReadyNote(model: CloudSetupModel): string {
  if (model.delivery === "sending") return "Your message is sending.";
  if (model.delivery === "queued") {
    if (model.session?.phase !== "ready")
      return "Your message will send when the session is ready.";
    // The machine is up but still connecting: "now" would contradict the wait note below.
    return model.projectWait === null
      ? "Your message will send now."
      : "Your message sends as soon as the machine is ready.";
  }
  return model.machineConnected
    ? "Everything is in place. Send your first message to start."
    : "The machine is up. Send your first message to connect to it and start.";
}

/** The honest long-wait explanation, or null when the setup is the quick kind. */
export function cloudSetupLongWaitNote(model: CloudSetupModel): string | null {
  if (model.stage !== "working" || !model.longWait) return null;
  return "Cloning the repository and installing dependencies. This can take several minutes.";
}

/** The one line about typing meanwhile; true to what the composer does. */
export function cloudSetupMeanwhileNote(model: CloudSetupModel): string | null {
  if (model.stage !== "working") return null;
  if (model.delivery === "sending") return null;
  if (model.delivery === "queued") {
    // Once the session is ready, the Ready note owns this; don't also say "when it is ready".
    return model.session?.phase === "ready"
      ? null
      : "Your message will send when the session is ready.";
  }
  return "You can type now; the first message sends when the session is ready.";
}

/** Visible subtitle under the title. Null while the step list alone carries the status. */
export function cloudSetupSubtitle(input: {
  readonly failed: boolean;
  readonly failureReason: string | null;
  readonly stage: CloudSetupModel["stage"];
  readonly notSeen: boolean;
  readonly activity: string;
  readonly readyNote: string;
  readonly slow: boolean;
  readonly delivery?: CloudSetupModel["delivery"];
  readonly sessionReady?: boolean;
}): string | null {
  if (input.failed) {
    return input.failureReason ?? "Something went wrong while the machine was starting.";
  }
  if (input.stage === "ready") return input.readyNote;
  if (input.sessionReady && (input.delivery === "queued" || input.delivery === "sending")) {
    return input.readyNote;
  }
  if (input.notSeen) return input.activity;
  if (input.slow) return "Taking longer than the rough estimate.";
  return null;
}
