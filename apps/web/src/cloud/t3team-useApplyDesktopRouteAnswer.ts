import type { EnvironmentId } from "@t3tools/contracts";

import { CredentialRequestError, credentialRequest } from "~/account/t3team-credentialRequest";
import { toastManager } from "../components/ui/toast";
import { useStableCallback } from "../hooks/useStableCallback";
import { usePrimaryEnvironmentId, useCloudSessions } from "../state/t3team-cloudSessions";
import { captureDesktopRouteApply } from "./t3team-desktopRouteCapture";

const HOST_SERVICE = "/api/t3team/host-services/nexplore-global.desktop-route";

/**
 * Makes the grant for an accepted desktop-route proposal on THIS desktop's host service, so a phone,
 * the VM or the agent can never create one. The session is the thread's own, never one the question
 * carries. Returns null unless the answer accepted a proposal; else a function to run after submit.
 */
export function useApplyDesktopRouteAnswer(thread: { readonly environmentId: EnvironmentId }) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { sessions } = useCloudSessions(thread.environmentId !== primaryEnvironmentId);
  return useStableCallback(
    (
      questions: Parameters<typeof captureDesktopRouteApply>[0]["questions"],
      answers: Record<string, unknown>,
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
        try {
          await credentialRequest("POST", `${HOST_SERVICE}/grant`, {
            fallbackReason: "host_service_failed",
            body: grant,
          });
          toastManager.add({
            type: "success",
            title: `Routing ${grant.target} through this computer`,
            description:
              grant.scope === "once"
                ? "Once."
                : grant.scope === "session"
                  ? "For this session."
                  : "Always, for this host.",
          });
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Desktop route not set up",
            description:
              error instanceof CredentialRequestError || error instanceof Error
                ? error.message
                : "The desktop could not make the grant.",
          });
        }
      };
    },
  );
}
