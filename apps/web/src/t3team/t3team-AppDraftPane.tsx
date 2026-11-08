import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import ChatView from "~/components/ChatView";
import { threadShellHasStarted } from "~/components/ChatView.logic";
import { DraftId, markPromotedDraftThreadByRef, useComposerDraftStore } from "~/composerDraftStore";
import { buildThreadRouteParams } from "~/threadRoutes";
import { useThreadRefs, useThreadShell } from "~/state/entities";
import { waitForDraftHeroTransition } from "~/components/chat/draftHeroTransition";

/**
 * Hosts upstream's draft (new thread) composer inside the Team shell.
 *
 * Upstream routes new threads to `/draft/$draftId`; the Team shell is the
 * permanent shell, so `t3team-upstreamRouteBridge` maps that location onto
 * `/t3team/drafts/$draftId` and this pane renders it. Promotion deliberately
 * navigates back to upstream's `/$environmentId/$threadId`, which the same
 * bridge already translates into the Team thread route — one code path for
 * resolving a thread's project instead of two.
 */
export function AppDraftPane({ draftId: rawDraftId }: { draftId: string }) {
  const navigate = useNavigate();
  const draftId = DraftId.make(rawDraftId);
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const threadRefs = useThreadRefs();
  const inferredThreadRef = draftSession
    ? (threadRefs.find(
        (ref) =>
          ref.environmentId === draftSession.environmentId &&
          ref.threadId === draftSession.threadId,
      ) ?? null)
    : null;
  const serverThreadRef = draftSession?.promotedTo ?? inferredThreadRef;
  const serverThread = useThreadShell(serverThreadRef);
  const canonicalThreadRef = threadShellHasStarted(serverThread) ? serverThreadRef : null;

  useEffect(() => {
    if (!inferredThreadRef || draftSession?.promotedTo) {
      return;
    }
    markPromotedDraftThreadByRef(inferredThreadRef);
  }, [draftSession?.promotedTo, inferredThreadRef]);

  useEffect(() => {
    if (!canonicalThreadRef) {
      return;
    }

    let cancelled = false;
    void waitForDraftHeroTransition().then(() => {
      if (cancelled) return;
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(canonicalThreadRef),
        replace: true,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [canonicalThreadRef, navigate]);

  // Match upstream `ThreadRouteView`: a draft that is gone leaves the shell
  // silently rather than trapping the user on an interstitial outside it.
  useEffect(() => {
    if (draftSession || canonicalThreadRef) {
      return;
    }
    void navigate({ to: "/t3team", replace: true });
  }, [canonicalThreadRef, draftSession, navigate]);

  if (!draftSession) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ChatView
        draftId={draftId}
        environmentId={draftSession.environmentId}
        threadId={draftSession.threadId}
        routeKind="draft"
        forceExpandedMobileComposer
      />
    </div>
  );
}
