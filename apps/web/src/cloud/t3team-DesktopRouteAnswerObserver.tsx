import { onThreadAnswersResolved } from "@t3tools/client-runtime/state/thread-answers";
import { useEffect } from "react";

import { readSessionsForBrokerAttach } from "~/connection/t3team-brokerSessionRead";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { readPrimaryEnvironmentId } from "~/state/environments";
import { cloudSessionListAtom } from "~/state/t3team-cloudSessions";
import { toastManager } from "../components/ui/toast";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import {
  isDesktopRouteOwnSubmit,
  isDesktopRouteRequestClaimed,
  runDesktopRouteOnce,
} from "./t3team-desktopRouteClaims";
import { postDesktopRouteGrant } from "./t3team-desktopRouteGrant";
import { handleDesktopRouteAnswers } from "./t3team-desktopRouteObserver";

/**
 * Desktop app only. A cloud session started from the phone is answered on the phone, which cannot
 * grant: this computer hears the answer and makes the grant itself, so the desktop stays the only
 * authority. Renders nothing.
 */
/** Flag off, nothing listens: the same host shape as the voice session host. */
export function DesktopRouteAnswerObserver() {
  return useFeatureFlag("AGENTS_DESKTOP_ROUTE") ? <DesktopRouteAnswerListener /> : null;
}

function DesktopRouteAnswerListener() {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds a listener on the thread streams until unmount
  useEffect(() => {
    const stop = onThreadAnswersResolved((event) => {
      void handleDesktopRouteAnswers(event, {
        now: Date.now,
        once: runDesktopRouteOnce,
        isClaimed: isDesktopRouteRequestClaimed,
        isOwnSubmit: isDesktopRouteOwnSubmit,
        primaryEnvironmentId: readPrimaryEnvironmentId,
        sessions: () =>
          readSessionsForBrokerAttach({ registry: appAtomRegistry, list: cloudSessionListAtom }),
        grant: postDesktopRouteGrant,
        notify: (notice) => toastManager.add({ type: "warning", ...notice }),
      }).catch((error: unknown) => {
        console.error("Desktop route observer failed", error);
      });
    });
    return () => void stop();
  }, []);
  return null;
}
