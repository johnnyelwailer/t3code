/**
 * Client gate for sending a plain-text My Work kickoff when Send is pressed. Server-authoritative
 * runtime feature flag (`MYWORK_KICKOFF_SEND_NOW`, default ON) read from the live
 * `ServerConfig.featureFlags`; off keeps the two-phase kickoff, where the thread's chat sends the
 * message when it mounts.
 */

import { readPrimaryServerConfig } from "~/t3team/t3team-serverState";
import { readServerFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

export function readT3TeamKickoffSendAtClickEnabled(): boolean {
  return readServerFeatureFlag(readPrimaryServerConfig(), "MYWORK_KICKOFF_SEND_NOW");
}
