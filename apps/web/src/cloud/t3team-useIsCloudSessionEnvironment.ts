import type { EnvironmentId } from "@t3tools/contracts";

import { useEnvironmentPresentation } from "~/state/presentation";
import { isCloudSessionEnvironment } from "./t3team-cloudSessionEnvironmentMatch";
import { useCloudSessionsOfMachine } from "./t3team-useCloudSessionsOfMachine";

/** Whether `environmentId` is a cloud session's machine (see `isCloudSessionEnvironment`). */
export function useIsCloudSessionEnvironment(environmentId: EnvironmentId | null): boolean {
  const { presentation } = useEnvironmentPresentation(environmentId);
  const { sessions } = useCloudSessionsOfMachine(environmentId);
  return (
    environmentId !== null &&
    isCloudSessionEnvironment({
      target: presentation?.entry.target ?? null,
      environmentId,
      sessions,
    })
  );
}
