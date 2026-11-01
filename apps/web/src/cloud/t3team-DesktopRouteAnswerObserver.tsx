import { onThreadAnswersResolved } from "@t3tools/client-runtime/state/thread-answers";
import { useEffect } from "react";

import { readSessionsForBrokerAttach } from "~/connection/t3team-brokerSessionRead";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { readPrimaryEnvironmentId } from "~/state/environments";
import { cloudSessionListAtom } from "~/state/t3team-cloudSessions";
import { toastManager } from "../components/ui/toast";
import { claimDesktopRouteRequest } from "./t3team-desktopRouteClaims";
import { postDesktopRouteGrant } from "./t3team-desktopRouteGrant";
import { handleDesktopRouteAnswers } from "./t3team-desktopRouteObserver";

/**
 * Desktop app only. A cloud session started from the phone is answered on the phone, which cannot
 * grant: this computer hears the answer and makes the grant itself, so the desktop stays the only
 * authority. Renders nothing.
 */
export function DesktopRouteAnswerObserver() {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds a listener on the thread streams until unmount
  useEffect(() => {
    const stop = onThreadAnswersResolved((event) => {
      void handleDesktopRouteAnswers(event, {
        now: Date.now,
        claim: claimDesktopRouteRequest,
        primaryEnvironmentId: readPrimaryEnvironmentId,
        sessions: () =>
          readSessionsForBrokerAttach({ registry: appAtomRegistry, list: cloudSessionListAtom }),
        grant: postDesktopRouteGrant,
        notify: (notice) => toastManager.add({ type: "warning", ...notice }),
      });
    });
    return () => void stop();
  }, []);
  return null;
}
