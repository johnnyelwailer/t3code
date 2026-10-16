import {
  CLOUD_SESSION_LIFETIME_SECONDS,
  cloudSessionFailureDescription,
} from "@t3tools/client-runtime/state/cloud-sessions";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Alert } from "react-native";

import { appAtomRegistry } from "../../state/atom-registry";
import { useAtomCommand } from "../../state/use-atom-command";
import { cloudSessionEnvironment, refreshCloudSessionList } from "../../state/t3team-cloudSessions";
import { runtime } from "../../lib/runtime";
import {
  accountStatusSnapshot,
  nexiBroker,
  startAccountSignIn,
  subscribeAccountStatus,
} from "../account/t3team-accountController";
import { chooseCloudSessionLauncher } from "./t3team-chooseCloudSessionLauncher";
import { startBrokerCloudSession } from "./t3team-startBrokerCloudSession";
import { useCloudSessionLauncher } from "./t3team-useCloudSessionLauncher";

/**
 * The primary action of the Environments header and the home empty state: "New cloud session" when
 * the Microsoft account is signed in, "Sign in" otherwise. A session starts through a connected
 * machine (the Machines screen's launcher pick and create command) when there is one, and through
 * the broker with the phone's own sign-in when there is not: no desktop is ever required.
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

  const startOnBroker = useCallback(async () => {
    setPending("cloud");
    try {
      const result = await runtime.runPromise(
        Effect.result(
          Effect.promise(nexiBroker).pipe(
            Effect.flatMap((broker) => startBrokerCloudSession(broker)),
          ),
        ),
      );
      Alert.alert(
        "New cloud session",
        result._tag === "Success"
          ? "Your session is starting. It appears under Running cloud sessions in Machines & cloud sessions."
          : result.failure.message,
      );
    } finally {
      setPending(null);
    }
  }, []);

  const onPress = useCallback(async () => {
    if (pending !== null) return;
    if (account?.auth._tag !== "SignedIn") {
      setPending("sign-in");
      try {
        const failure = await startAccountSignIn();
        if (failure !== null) Alert.alert("Sign in", failure.message);
      } finally {
        setPending(null);
      }
      return;
    }
    const [only] = launchers;
    if (only === undefined) {
      await startOnBroker();
      return;
    }
    if (launchers.length > 1) {
      chooseCloudSessionLauncher(launchers, (environmentId) => void start(environmentId));
      return;
    }
    void start(only.environmentId);
  }, [account, launchers, pending, start, startOnBroker]);

  return {
    signedIn: account?.auth._tag === "SignedIn",
    loading: pending !== null,
    onPress: () => void onPress(),
  };
}
