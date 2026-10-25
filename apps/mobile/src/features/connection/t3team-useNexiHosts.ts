import { useEffect, useRef, useState } from "react";
import { useNetworkState } from "expo-network";
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
import { nexiFeatureFlagPreset } from "./t3team-nexiConfig";
import { NexiSignInRequiredError, type NexiDeviceCode } from "./t3team-nexiOAuth";
import { classifyNexiStartError, type NexiStartError } from "./t3team-nexiStartError";
import type { NexiStartInput } from "./t3team-nexiStartModel";
import { nexiStartPreview } from "./t3team-nexiStartPreview";

const flagPreset = nexiFeatureFlagPreset();

/** `onConnected` defaults to leaving the add-environment screen the hook was opened from. */
export function useNexiHosts(options: { readonly onConnected?: () => void } = {}) {
  const enabled = mobileBrokerEnabled(useServerConfigs().values(), flagPreset);
  const [hosts, setHosts] = useState<readonly NexiHost[] | null>(null);
  const [code, setCode] = useState<NexiDeviceCode | null>(null);
  const [error, setError] = useState<NexiStartError | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectingHostId, setConnectingHostId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loadedAt, setLoadedAt] = useState(Date.now);
  const network = useNetworkState();
  const operation = useRef<AbortController | null>(null);
  const navigation = useNavigation();
  const register = useAtomCommand(environmentCatalog.register, { reportFailure: false });
  const cancel = () => {
    operation.current?.abort();
    setCode(null);
    setBusy(false);
  };
  useEffect(
    () => () => {
      operation.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!enabled) {
      operation.current?.abort();
      closeNexiTunnels();
    }
  }, [enabled]);
  const run = (action: (signal: AbortSignal) => Promise<void>, hostId?: string) => {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError(null);
    void action(controller.signal)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const failure = classifyNexiStartError(cause, { hostId });
        setError(failure);
        // An expired or refused token means the account is signed out, not that the list is empty.
        if (failure.kind === "auth") {
          setSignedIn(false);
          setHosts(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
          setCode(null);
          setConnectingHostId(null);
        }
      });
  };
  const refresh = async (signal: AbortSignal) => {
    const mine = await mobileBroker.hosts();
    if (signal.aborted) return;
    setHosts(mine);
    setLoadedAt(Date.now());
    setSignedIn(true);
  };
  useEffect(() => {
    if (!enabled || !nexiAccount) return;
    void nexiAccount.accessToken().then(
      () => {
        setSignedIn(true);
        run(refresh);
      },
      (cause: unknown) => {
        // Only a missing or revoked token means signed out; a failed refresh is a retryable fault.
        const signedOut = cause instanceof NexiSignInRequiredError;
        setSignedIn(!signedOut);
        if (!signedOut) setError(classifyNexiStartError(cause));
      },
    );
  }, [enabled]);
  const live: NexiStartInput = {
    enabled,
    signedIn,
    deviceCodePending: code !== null,
    hosts,
    busy,
    connectingHostId,
    error,
    offline: network.isConnected === false || network.isInternetReachable === false,
    now: loadedAt,
  };
  return {
    input: nexiStartPreview() ?? live,
    code,
    cancel,
    setError: (message: string) => setError({ kind: "other", message }),
    signIn: () =>
      run(async (signal) => {
        await mobileBroker.checkEnabled();
        const next = await nexiAccount!.requestCode(signal);
        if (signal.aborted) return;
        setCode(next);
        await nexiAccount!.poll(next, signal);
        await refresh(signal);
      }),
    refresh: () => run(refresh),
    connect: (host: NexiHost) => {
      setConnectingHostId(host.id);
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
        if (signal.aborted) return;
        if (options.onConnected) options.onConnected();
        else navigation.goBack();
      }, host.id);
    },
    signOut: () =>
      run(async () => {
        closeNexiTunnels();
        await nexiAccount!.signOut();
        setHosts(null);
        setSignedIn(false);
      }),
  };
}
