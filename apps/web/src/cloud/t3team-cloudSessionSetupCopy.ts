/**
 * The words of the setup card that are not step labels: the time range, what it is based on, the
 * honest long-wait explanation, what the user can do meanwhile, and what assistive tech hears. Pure.
 */
import type { CloudSetupModel } from "./t3team-cloudSessionSetupModel";

/** "About 1-2 min left". Rounds to friendly numbers; never says zero. */
export function formatCloudSetupRemaining(lowSeconds: number, highSeconds: number): string {
  if (highSeconds <= 45) return "Less than a minute left";
  if (highSeconds <= 90) return "About a minute left";
  const round = highSeconds > 600 ? 5 : 1;
  const high = Math.ceil(highSeconds / 60 / round) * round;
  const low = Math.min(Math.max(1, Math.round(lowSeconds / 60 / round) * round), high);
  return low >= high ? `About ${high} min left` : `About ${low}–${high} min left`;
}

/** "1-2 min", for the basis line ("Usually 1-2 min"). */
function formatCloudSetupTypical(lowSeconds: number, highSeconds: number): string {
  if (highSeconds <= 90) return "about a minute";
  const high = Math.ceil(highSeconds / 60);
  const low = Math.min(Math.max(1, Math.round(lowSeconds / 60)), high);
  return low >= high ? `about ${high} min` : `${low}–${high} min`;
}

export function basisTextOf(model: CloudSetupModel): string | null {
  const { timing } = model;
  const range = formatCloudSetupTypical(timing.readyLowSeconds, timing.readyHighSeconds);
  if (model.measured) {
    const typical = `Usually ${range}`;
    const noun = timing.scope === "project" ? "sessions of this project" : "sessions like this";
    const count = timing.samples;
    return `${typical}, from your last ${count === 1 ? `1 of ${noun}` : `${count} ${noun}`}`;
  }
  return `Rough estimate: ${range}, based on fleet provisioning timing`;
}

/** What assistive tech hears: changes with the step, never with the clock. */
export function cloudSetupAnnouncement(model: CloudSetupModel): string {
  return model.stage === "ready"
    ? "Your cloud session is ready."
    : model.stage === "failed"
      ? "Cloud session setup failed."
      : model.activity;
}

/** The honest long-wait explanation, or null when the setup is the quick kind. */
export function cloudSetupLongWaitNote(model: CloudSetupModel): string | null {
  if (model.stage !== "working" || !model.longWait) return null;
  const history =
    model.measured && model.timing.scope === "project"
      ? "Earlier sessions of this project give the range above."
      : "The first time for a project can take several minutes.";
  return `Your repository is being prepared: cloning it and installing its dependencies. ${history}`;
}

/** The one line about typing meanwhile; true to what the composer does. */
export function cloudSetupMeanwhileNote(model: CloudSetupModel): string | null {
  if (model.stage !== "working") return null;
  if (model.delivery === "sending") return null;
  return model.delivery === "queued"
    ? "Your message is waiting and will be sent as soon as the session is ready."
    : "You can already type: your first message is sent as soon as the session is ready.";
}
