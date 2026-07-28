import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import ChatView from "~/components/ChatView";
import { threadHasStarted } from "~/components/ChatView.logic";
import { DraftId, markPromotedDraftThreadByRef, useComposerDraftStore } from "~/composerDraftStore";
import { buildThreadRouteParams } from "~/threadRoutes";
import { useThread, useThreadRefs } from "~/state/entities";
import { Button } from "~/t3team/components/ui/t3team-button";
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
  const serverThread = useThread(serverThreadRef);
  const canonicalThreadRef = threadHasStarted(serverThread) ? serverThreadRef : null;

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

  // A draft that is neither in the store nor promoted no longer exists — say so
  // instead of bouncing the user to a surface that looks like something else
  // went wrong.
  if (!draftSession) {
    if (canonicalThreadRef) return null;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h2 className="text-base font-medium">This draft is no longer available</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Drafts live in this browser until you send the first message. This one was discarded, sent
          from another tab, or cleared with the browser&rsquo;s site data.
        </p>
        <Button variant="outline" onClick={() => void navigate({ to: "/t3team", replace: true })}>
          Back to My work
        </Button>
      </div>
    );
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
