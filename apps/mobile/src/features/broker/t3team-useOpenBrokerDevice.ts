import { useNavigation } from "@react-navigation/native";
import {
  BrokerConnectionRegistration,
  BrokerConnectionTarget,
} from "@t3tools/client-runtime/connection";
import { cloudSessionFailureDescription } from "@t3tools/client-runtime/state/cloud-sessions";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { useState } from "react";

import { environmentCatalog } from "../../connection/catalog";
import { runtime } from "../../lib/runtime";
import { useAtomCommand } from "../../state/use-atom-command";
import { probeBrokerDevice } from "./t3team-brokerDeviceProbe";

/** A device the phone can open: its broker key (a run id, or `h-<hostId>`) and its name. */
export interface BrokerDeviceToOpen {
  readonly key: string;
  readonly label: string;
}

/**
 * Opens a machine or cloud session on the phone: asks it through the broker which environment it
 * is, registers it like any other environment, then shows the thread list, where its threads, chat
 * and terminal appear as they do on the desktop. A broker that cannot proxy for phones says so here,
 * before anything is registered.
 */
export function useOpenBrokerDevice() {
  const register = useAtomCommand(environmentCatalog.register, { reportFailure: false });
  const navigation = useNavigation();
  const [opening, setOpening] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const open = async (device: BrokerDeviceToOpen) => {
    setOpening(device.key);
    setFailure(null);
    try {
      const probed = await runtime.runPromise(Effect.result(probeBrokerDevice(device.key)));
      if (probed._tag === "Failure") {
        setFailure(probed.failure.detail);
        return;
      }
      const result = await register(
        new BrokerConnectionRegistration({
          target: new BrokerConnectionTarget({
            environmentId: EnvironmentId.make(probed.success.environmentId),
            label: device.label,
            sessionId: device.key,
          }),
        }),
      );
      if (result._tag === "Success") navigation.navigate("Home");
      else setFailure(cloudSessionFailureDescription(result));
    } finally {
      setOpening(null);
    }
  };

  return { open, opening, failure };
}
