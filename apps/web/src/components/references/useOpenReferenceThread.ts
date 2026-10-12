import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { buildThreadRouteParams } from "~/threadRoutes";

/**
 * Focus a rostered thread — the same route the sidebar rows and the relationship tree navigate
 * to. Reads the active environment's routing; the panel only offers a target it can navigate to.
 */
export function useOpenReferenceThread(environmentId: EnvironmentId) {
  const navigate = useNavigate();
  return useCallback(
    (threadId: ThreadId) => {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
      });
    },
    [environmentId, navigate],
  );
}
