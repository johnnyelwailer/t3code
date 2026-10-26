import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

import { useCloudSessions } from "~/state/t3team-cloudSessions";

import { liveCloudSessionForEnvironment } from "./t3team-cloudSessionEnvironmentMatch";

/**
 * A cloud session's machine is new each time, so a sign-in it asks for is one the user already
 * gave somewhere else (nexplore.ghe.com/hive/nx-nexi/issues/656).
 */
export const CLOUD_MACHINE_SIGN_IN_COPY = "We need to sign you in again for this machine.";

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
  const { sessions } = useCloudSessions();
  return environmentId === null
    ? undefined
    : signInDescriptionForEnvironment(sessions, environmentId);
}
