import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import {
  BrokerConnectionRegistration,
  BrokerConnectionTarget,
} from "@t3tools/client-runtime/connection";
import { AsyncResult } from "effect/reactivity";
import { useServerConfigs } from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import { environmentCatalog } from "../../connection/catalog";
import { mobileBroker } from "../../connection/t3team-nexiBroker";
import { mobileBrokerEnabled, type NexiHost } from "../../connection/t3team-nexiBrokerClient";
import { closeNexiTunnels } from "../../connection/t3team-nexiNative";
import { nexiAccount } from "./t3team-nexiAccount";
import { createNexiOperationRunner } from "./t3team-nexiOperation";
import type { NexiDeviceCode } from "./t3team-nexiOAuth";

export function useNexiHosts() {
  const enabled = mobileBrokerEnabled(useServerConfigs().values());
  const [hosts, setHosts] = useState<readonly NexiHost[]>([]);
  const [code, setCode] = useState<NexiDeviceCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [operations] = useState(() =>
    createNexiOperationRunner({ setBusy, setError, clearCode: () => setCode(null) }),
  );
  const navigation = useNavigation();
  const register = useAtomCommand(environmentCatalog.register, { reportFailure: false });
  const cancel = operations.cancel;
  useEffect(() => operations.abort, [operations]);
  useEffect(() => {
    if (!enabled) {
      // Reset as well as abort: an aborted operation never clears its own busy state.
      operations.cancel();
      closeNexiTunnels();
    }
  }, [enabled, operations]);
  const run = operations.run;
  const refresh = async (signal: AbortSignal) => {
    const mine = await mobileBroker.hosts();
    if (!signal.aborted) setHosts(mine);
  };
  return {
    enabled,
    hosts,
    code,
    error,
    busy,
    cancel,
    setError,
    signIn: () =>
      run(async (signal) => {
        await mobileBroker.checkEnabled();
        const next = await nexiAccount!.requestCode(signal);
        if (signal.aborted) return;
        setCode(next);
        await nexiAccount!.poll(next, signal);
        // Signing in again replaces the account without a sign-out: streams opened as the previous
        // account must not outlive it, exactly as on sign-out.
        closeNexiTunnels();
        await refresh(signal);
      }),
    refresh: () => run(refresh),
    connect: (host: NexiHost) =>
      run(async (signal) => {
        const discovered = await mobileBroker.discoverHost(host);
        if (signal.aborted) return;
        const result = await register(
          new BrokerConnectionRegistration({
            target: new BrokerConnectionTarget({
              environmentId: discovered.environmentId,
              label: discovered.label,
              sessionId: discovered.sessionId,
            }),
          }),
        );
        if (AsyncResult.isFailure(result))
          throw new Error("Could not attach the desktop. Check its connection and try again.");
        if (!signal.aborted) navigation.goBack();
      }),
    signOut: () =>
      run(async () => {
        closeNexiTunnels();
        await nexiAccount!.signOut();
        setHosts([]);
      }),
  };
}
