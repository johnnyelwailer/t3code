import {
  CLOUD_SESSION_LIFETIME_SECONDS,
  cloudSessionFailureDescription,
} from "@t3tools/client-runtime/state/cloud-sessions";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Alert } from "react-native";

import { appAtomRegistry } from "../../state/atom-registry";
import { useAtomCommand } from "../../state/use-atom-command";
import { cloudSessionEnvironment, refreshCloudSessionList } from "../../state/t3team-cloudSessions";
import {
  accountStatusSnapshot,
  startAccountSignIn,
  subscribeAccountStatus,
} from "../account/t3team-accountController";
import { chooseCloudSessionLauncher } from "./t3team-chooseCloudSessionLauncher";
import { useCloudSessionLauncher } from "./t3team-useCloudSessionLauncher";

/**
 * The primary action of the Environments header and the home empty state: "New cloud session" when
 * the Microsoft account is signed in, "Sign in" otherwise. Starting a session reuses the Machines
 * screen's launcher pick and the cloud-session create command.
 */
export function usePrimaryCloudAction() {
  const account = useSyncExternalStore(subscribeAccountStatus, accountStatusSnapshot);
  const { launchers } = useCloudSessionLauncher();
  const createSession = useAtomCommand(cloudSessionEnvironment.create, {
    reportFailure: false,
  });
  /** "cloud" while a session starts, "sign-in" while the Microsoft sign-in runs. */
  const [pending, setPending] = useState<"cloud" | "sign-in" | null>(null);

  const start = useCallback(
    async (environmentId: EnvironmentId) => {
      setPending("cloud");
      try {
        const result = await createSession({
          environmentId,
          input: { durationSeconds: CLOUD_SESSION_LIFETIME_SECONDS },
        });
        if (result._tag === "Success")
          await appAtomRegistry.refresh(refreshCloudSessionList(environmentId));
        else if (!isAtomCommandInterrupted(result))
          Alert.alert("New cloud session", cloudSessionFailureDescription(result));
      } finally {
        setPending(null);
      }
    },
    [createSession],
  );

  const onPress = useCallback(async () => {
    if (pending !== null) return;
    if (account?.auth._tag !== "SignedIn") {
      setPending("sign-in");
      try {
        await startAccountSignIn();
      } finally {
        setPending(null);
      }
      return;
    }
    const [only] = launchers;
    if (only === undefined) {
      Alert.alert(
        "New cloud session",
        "Connect Nexi Work on your desktop to start cloud sessions from here.",
      );
      return;
    }
    if (launchers.length > 1) {
      chooseCloudSessionLauncher(launchers, (environmentId) => void start(environmentId));
      return;
    }
    void start(only.environmentId);
  }, [account, launchers, pending, start]);

  return {
    signedIn: account?.auth._tag === "SignedIn",
    loading: pending !== null,
    onPress: () => void onPress(),
  };
}
