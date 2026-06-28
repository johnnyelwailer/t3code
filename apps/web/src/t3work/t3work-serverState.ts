import { useAtomValue } from "@effect/atom-react";
import type { ServerConfig } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { usePrimaryEnvironmentId } from "~/state/environments";
import {
  primaryServerConfigAtom,
  primaryServerKeybindingsAtom,
  serverEnvironment,
} from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

export function readPrimaryServerConfig(): ServerConfig | null {
  return appAtomRegistry.get(primaryServerConfigAtom);
}

export function useServerConfig(): ServerConfig | null {
  return useAtomValue(primaryServerConfigAtom);
}

export function shouldRefreshPrimaryProviders(input: {
  readonly enabled: boolean;
  readonly isConnected: boolean;
  readonly environmentId: string | null;
  readonly serverConfig: Pick<ServerConfig, "providers"> | null;
}): boolean {
  return (
    input.enabled &&
    input.isConnected &&
    input.environmentId !== null &&
    input.serverConfig !== null &&
    input.serverConfig.providers.length === 0
  );
}

export function useEnsurePrimaryProvidersRefreshed(input: {
  readonly enabled: boolean;
  readonly isConnected: boolean;
  readonly serverConfig: ServerConfig | null;
}) {
  const environmentId = usePrimaryEnvironmentId();
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const attemptedEnvironmentRef = useRef<string | null>(null);

  useEffect(() => {
    if (input.serverConfig !== null && input.serverConfig.providers.length > 0) {
      attemptedEnvironmentRef.current = null;
      return;
    }
    if (!shouldRefreshPrimaryProviders({ ...input, environmentId })) {
      return;
    }
    if (environmentId === null) {
      return;
    }
    if (attemptedEnvironmentRef.current === environmentId) {
      return;
    }

    attemptedEnvironmentRef.current = environmentId;
    void refreshProviders({ environmentId, input: {} });
  }, [environmentId, input.enabled, input.isConnected, input.serverConfig, refreshProviders]);
}

export function useServerKeybindings(): ServerConfig["keybindings"] {
  return useAtomValue(primaryServerKeybindingsAtom);
}
