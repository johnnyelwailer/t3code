import { useAtomValue } from "@effect/atom-react";
import type { ServerConfig, ServerSettings } from "@t3tools/contracts";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryServerConfigAtom, primaryServerKeybindingsAtom } from "~/state/server";

export function getServerConfig(): ServerConfig | null {
  return appAtomRegistry.get(primaryServerConfigAtom);
}

export function useServerConfig(): ServerConfig | null {
  return useAtomValue(primaryServerConfigAtom);
}

export function useServerKeybindings(): ServerConfig["keybindings"] {
  return useAtomValue(primaryServerKeybindingsAtom);
}

export function applySettingsUpdated(_settings: ServerSettings): void {
  // Optimistic server settings are owned by the primary server config stream.
}
