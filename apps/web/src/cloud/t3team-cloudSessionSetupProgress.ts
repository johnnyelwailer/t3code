/** Setup card adapter for the canonical queued-send steps and provisioning estimate. */
export {
  buildCloudSessionSetup,
  type CloudSetupDelivery,
  type CloudSetupFacts,
  type CloudSetupModel,
  type CloudSetupStepStatus,
  type CloudSetupStepView,
} from "./t3team-cloudSessionSetupModel";
export { readCloudSetup, cloudSetupElapsedSeconds } from "./t3team-cloudSessionSetupReadout";
export {
  cloudSetupAnnouncement,
  cloudSetupLongWaitNote,
  cloudSetupMeanwhileNote,
  formatCloudSetupRemaining,
} from "./t3team-cloudSessionSetupCopy";
