/**
 * The sidecar section host, reachable from inside a compiled action view. MDX-kit components
 * that act on the project (the `RunToggle` switch) launch through the host's own thread-creating
 * path instead of assembling a launch by hand. Null outside a section (stories, tests).
 */
import { createContext, useContext } from "react";

import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";

export const T3TeamSidecarSectionHostContext = createContext<SidecarSectionHost | null>(null);

export function useSidecarSectionHost(): SidecarSectionHost | null {
  return useContext(T3TeamSidecarSectionHostContext);
}
