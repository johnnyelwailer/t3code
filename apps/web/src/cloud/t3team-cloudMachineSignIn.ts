import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

import { liveCloudSessionForEnvironment } from "./t3team-cloudSessionEnvironmentMatch";
import { useCloudSessionsOfMachine } from "./t3team-useCloudSessionsOfMachine";

/**
 * A cloud session's machine is new each time, so a sign-in it asks for is one the user already
 * gave somewhere else (nexplore.ghe.com/hive/nx-nexi/issues/656).
 */
export const CLOUD_MACHINE_SIGN_IN_COPY = "We need you to sign in on this machine.";

export function signInDescriptionForEnvironment(
  sessions: readonly CloudSession[],
  environmentId: EnvironmentId,
): string | undefined {
  return liveCloudSessionForEnvironment(sessions, environmentId) === null
    ? undefined
    : CLOUD_MACHINE_SIGN_IN_COPY;
}

export function useSignInDescriptionForEnvironment(
  environmentId: EnvironmentId | null,
): string | undefined {
  const { sessions } = useCloudSessionsOfMachine(environmentId);
  return environmentId === null
    ? undefined
    : signInDescriptionForEnvironment(sessions, environmentId);
}

/** How a failure sentence names the machine a sign-in runs on. Mid-sentence, so lower case. */
function toolAuthMachineLabel(
  sessions: readonly CloudSession[],
  environmentId: EnvironmentId | null,
): string {
  if (environmentId === null) return "the cloud machine";
  return liveCloudSessionForEnvironment(sessions, environmentId) === null
    ? "this machine"
    : "this cloud machine";
}

export function useToolAuthMachineLabel(environmentId: EnvironmentId | null): string {
  const { sessions } = useCloudSessionsOfMachine(environmentId);
  return toolAuthMachineLabel(sessions, environmentId);
}
