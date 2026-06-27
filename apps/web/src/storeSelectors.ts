import type { ScopedThreadRef } from "@t3tools/contracts";

import { appAtomRegistry } from "./rpc/atomRegistry";
import { mergeEnvironmentThread } from "@t3tools/client-runtime/state/threads";
import { environmentThreadDetails, environmentThreadShells } from "./state/threads";
import type { Thread } from "./types";
import { type AppState, registerThreadSelectorRef } from "./store";

export function createThreadSelectorByRef(
  ref: ScopedThreadRef | null | undefined,
): (state: AppState) => Thread | undefined {
  const selector = () => {
    if (!ref) {
      return undefined;
    }

    const shell = appAtomRegistry.get(environmentThreadShells.threadShellAtom(ref));
    const detail = appAtomRegistry.get(environmentThreadDetails.detailAtom(ref));
    return mergeEnvironmentThread(detail, shell) ?? undefined;
  };

  registerThreadSelectorRef(selector, ref ?? null);
  return selector;
}
