import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import type { FeatureFlagKey } from "@t3tools/project-context/t3teamFeatureFlags";

import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

/**
 * A feature the setup page switches on from its own row, so the row never sends the user to
 * Settings. `usable` is false only when the flag is off and this client may not change it.
 */
export function useWelcomeFlagSwitch(key: FeatureFlagKey, environmentId: EnvironmentId | null) {
  const on = useFeatureFlag(key);
  const canEdit = useAtomValue(serverEnvironment.setFeatureFlag.permissionAtom(environmentId));
  const setFeatureFlag = useAtomCommand(serverEnvironment.setFeatureFlag);
  return {
    on,
    usable: on || (canEdit && environmentId !== null),
    /** Resolves true once the flag is on. */
    turnOn: async () => {
      if (on) return true;
      if (environmentId === null || !canEdit) return false;
      const result = await setFeatureFlag({ environmentId, input: { key, enabled: true } });
      return result._tag === "Success";
    },
  };
}
