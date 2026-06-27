import { useAtomValue } from "@effect/atom-react";
import type { ServerConfig } from "@t3tools/contracts";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryServerConfigAtom, primaryServerKeybindingsAtom } from "~/state/server";

export function readPrimaryServerConfig(): ServerConfig | null {
  return appAtomRegistry.get(primaryServerConfigAtom);
}

export function useServerConfig(): ServerConfig | null {
  return useAtomValue(primaryServerConfigAtom);
}

export function useServerKeybindings(): ServerConfig["keybindings"] {
  return useAtomValue(primaryServerKeybindingsAtom);
}
