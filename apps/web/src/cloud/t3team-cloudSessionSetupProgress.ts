/**
 * What "Setting up your cloud session" shows while a session becomes ready: the steps in plain
 * words, an honest time range, and a progress position that moves with the clock between polls.
 * Pure and React-free on purpose: the thread card, the hook that feeds it and the stories all
 * import from here, so the wording, the estimate and the motion cannot drift apart. The module is
 * split by concern to stay reviewable; this file is the one entry point.
 *
 *  - Steps: step vocabulary per session shape, fallback timing (`...SetupSteps`).
 *  - Model: a session snapshot turned into steps and a current step (`...SetupModel`). It changes
 *    when a poll lands, every 10-22 s.
 *  - Readout: the model at a clock reading: progress, estimate, slow or not (`...SetupReadout`).
 *  - Curve / Copy: the bar's geometry and the card's non-step words.
 *
 * Honesty rules the tests pin down:
 *  - the estimate is a RANGE, and it never counts down to zero while the session is still working:
 *    past the slow end of the range the line says it is taking longer than usual;
 *  - progress is monotonic in time, stays below `CLOUD_SETUP_PROGRESS_CEILING` until the session
 *    is ready, and never moves backwards at a step change;
 *  - measured timing (`CloudSession.timing`, derived on the server from the user's own recent
 *    runs) beats the fallback constants, which are worded vaguely.
 */
export {
  CLOUD_SETUP_PROGRESS_CEILING,
  type CloudSetupShape,
  type CloudSetupStepId,
} from "./t3team-cloudSessionSetupSteps";
export {
  buildCloudSessionSetup,
  type CloudSetupDelivery,
  type CloudSetupFacts,
  type CloudSetupModel,
  type CloudSetupStepStatus,
  type CloudSetupStepView,
} from "./t3team-cloudSessionSetupModel";
export {
  cloudSetupElapsedSeconds,
  type CloudSetupStepMotion,
} from "./t3team-cloudSessionSetupCurve";
export { readCloudSetup, type CloudSetupReadout } from "./t3team-cloudSessionSetupReadout";
export {
  cloudSetupAnnouncement,
  cloudSetupLongWaitNote,
  cloudSetupMeanwhileNote,
  formatCloudSetupRemaining,
} from "./t3team-cloudSessionSetupCopy";
