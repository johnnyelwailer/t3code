import type { EnvironmentId } from "@t3tools/contracts";

import { useEnvironmentPresentation } from "~/state/presentation";
import { useCloudSessions } from "~/state/t3team-cloudSessions";

import { isCloudSessionEnvironment } from "./t3team-cloudSessionEnvironmentMatch";

/** Whether `environmentId` is a cloud session's machine (see `isCloudSessionEnvironment`). */
export function useIsCloudSessionEnvironment(environmentId: EnvironmentId | null): boolean {
  const { presentation } = useEnvironmentPresentation(environmentId);
  const { sessions } = useCloudSessions();
  return (
    environmentId !== null &&
    isCloudSessionEnvironment({
      target: presentation?.entry.target ?? null,
      environmentId,
      sessions,
    })
  );
}
