import { useAtomValue } from "@effect/atom-react";

import { APP_VERSION } from "~/branding";
import { useEnvironments } from "~/state/environments";
import { environmentIdsKey } from "~/state/environmentAtomList";
import { environmentUpdateStatesAtom } from "~/state/server";
import { environmentSessionStatesAtom } from "~/state/session";
import { canUpdateServer } from "../ServerUpdateAction";
import { collectServerUpdateTargets } from "./updateEverything.logic";
import { isHostedByThisApp } from "./useUpdateEverything";

/**
 * The servers the update dialog lists, as targets one entry button can update on its own.
 * Repeats the machine list `useUpdateEverything` builds, which it does not expose and the additive
 * guard allows no upstream edit to; check it on every upstream sync.
 */
export function useUpdateEntryTargets(localUpdateVersion: string | null) {
  const { environments } = useEnvironments();
  const environmentIds = environmentIdsKey(environments.map(({ environmentId }) => environmentId));
  const sessionStates = useAtomValue(environmentSessionStatesAtom(environmentIds));
  const updateStates = useAtomValue(environmentUpdateStatesAtom(environmentIds));
  const machines = environments.map((environment, index) => ({
    environmentId: environment.environmentId,
    label: environment.label,
    serverConfig: environment.serverConfig,
    connected: environment.connection.phase === "connected",
    hostedByThisApp: isHostedByThisApp(environment),
    canMaintain: canUpdateServer(sessionStates[index]!),
    updateState: updateStates[index]!,
  }));
  return collectServerUpdateTargets(machines, localUpdateVersion ?? APP_VERSION).targets;
}
