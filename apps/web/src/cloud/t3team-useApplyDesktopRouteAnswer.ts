import type { EnvironmentId } from "@t3tools/contracts";

import { toastManager } from "../components/ui/toast";
import { useStableCallback } from "../hooks/useStableCallback";
import { usePrimaryEnvironmentId, useCloudSessions } from "../state/t3team-cloudSessions";
import { captureDesktopRouteApply } from "./t3team-desktopRouteCapture";
import { claimDesktopRouteRequest } from "./t3team-desktopRouteClaims";
import { postDesktopRouteGrant } from "./t3team-desktopRouteGrant";

/**
 * Grants an accepted desktop-route proposal on THIS desktop's host service; a phone, the VM or the
 * agent never can. The session is the thread's own. Returns null unless the answer accepted one.
 * `requestId` shares one claim with the observer of answers made elsewhere: one answer grants once.
 */
export function useApplyDesktopRouteAnswer(thread: { readonly environmentId: EnvironmentId }) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { sessions } = useCloudSessions(thread.environmentId !== primaryEnvironmentId);
  return useStableCallback(
    (
      questions: Parameters<typeof captureDesktopRouteApply>[0]["questions"],
      answers: Record<string, unknown>,
      requestId?: string,
    ) => {
      const captured = captureDesktopRouteApply({
        questions,
        answers,
        threadEnvironmentId: thread.environmentId,
        primaryEnvironmentId,
        sessions,
      });
      if (captured === null) return null;
      if (captured.grant === null) {
        const { problem } = captured;
        return async () => {
          toastManager.add({
            type: "warning",
            title: "Desktop route not set up",
            description: problem,
          });
        };
      }
      const { grant } = captured;
      return async () => {
        if (requestId !== undefined && !claimDesktopRouteRequest(requestId)) return;
        await postDesktopRouteGrant(grant);
      };
    },
  );
}
