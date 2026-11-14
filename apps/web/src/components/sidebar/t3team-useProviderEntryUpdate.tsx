import type { EnvironmentId } from "@t3tools/contracts";

import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  getProviderUpdateRunToastView,
  type ProviderUpdateRun,
} from "../ProviderUpdateLaunchNotification.logic";
import { useProviderUpdates } from "../ProviderUpdatesAction";
import { stackedThreadToast, toastManager } from "../ui/toast";

type Candidate = ReturnType<typeof useProviderUpdates>["machines"][number]["candidates"][number];

/** One provider on one machine, updated on its own with the same result toast as updating all. */
export function useProviderEntryUpdate() {
  const { machines } = useProviderUpdates();
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider, { reportFailure: false });
  const update = async (
    environmentId: EnvironmentId,
    machineLabel: string,
    candidate: Candidate,
  ): Promise<void> => {
    const run: ProviderUpdateRun = {
      environmentId,
      machineLabel,
      driver: candidate.driver,
      instanceId: candidate.instanceId,
      result: await updateProvider({
        environmentId,
        input: { provider: candidate.driver, instanceId: candidate.instanceId },
      }),
    };
    const view = getProviderUpdateRunToastView([run]);
    if (view) {
      toastManager.add(
        stackedThreadToast({
          ...view,
          description: <span className="whitespace-pre-line">{view.description}</span>,
        }),
      );
    }
  };
  return { machines, update };
}
