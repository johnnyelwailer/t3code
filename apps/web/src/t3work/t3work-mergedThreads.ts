import { useMemo } from "react";

import { mergeEnvironmentThread } from "@t3tools/client-runtime/state/threads";
import type { EnvironmentThread } from "@t3tools/client-runtime/state/shell";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { useThreadRefs, useThreadShells } from "~/state/entities";
import { environmentThreadDetails, environmentThreadShells } from "~/state/threads";

export function useMergedThreads(): ReadonlyArray<EnvironmentThread> {
  const refs = useThreadRefs();
  useThreadShells();

  return useMemo(
    () =>
      refs.flatMap((ref) => {
        const thread = mergeEnvironmentThread(
          appAtomRegistry.get(environmentThreadDetails.detailAtom(ref)),
          appAtomRegistry.get(environmentThreadShells.threadShellAtom(ref)),
        );
        return thread ? [thread] : [];
      }),
    [refs],
  );
}
