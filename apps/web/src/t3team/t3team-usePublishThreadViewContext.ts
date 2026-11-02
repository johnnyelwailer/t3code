import { ThreadId } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { readViewContextApi } from "~/t3team/backend/t3team-viewContextApi";
import { useBackend } from "~/t3team/backend/t3team-index";
import { useDigestPrAsideStore } from "~/t3team/t3team-digestPrAsideStore";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import { buildViewContext, selectionFromAside } from "~/t3team/t3team-viewContextBuild";
import { createViewContextPublisher } from "~/t3team/t3team-viewContextPublisher";
import { useViewContextStore } from "~/t3team/t3team-viewContextStore";

/**
 * Publishes the My Work view's state for the thread open beside it, as it changes (see
 * `createViewContextPublisher`). Nothing is sent without a thread, off the My Work view, or with the
 * flag off; the entry is cleared when the thread or the view goes away.
 */
export function usePublishThreadViewContext(input: {
  readonly threadId: string | null;
  readonly projectId: string;
  readonly active: boolean;
}) {
  const { threadId, projectId, active } = input;
  const enabled = useFeatureFlag("AGENTS_VIEW_CONTEXT");
  const api = readViewContextApi(useBackend());
  const view = useViewContextStore((state) => state.view);
  const items = useViewContextStore((state) => state.items);
  const ticket = useDigestPrAsideStore((state) =>
    state.ticket?.projectId === projectId ? state.ticket : null,
  );
  const pullRequest = useDigestPrAsideStore((state) =>
    state.pullRequest?.projectId === projectId ? state.pullRequest : null,
  );
  const context = active
    ? buildViewContext({
        projectId,
        view,
        items,
        selection: selectionFromAside(ticket, pullRequest),
      })
    : null;
  const publisher = useRef<ReturnType<typeof createViewContextPublisher> | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds the server entry for this thread until the thread or view goes away
  useEffect(() => {
    if (!enabled || api === undefined || threadId === null) return;
    const id = ThreadId.make(threadId);
    publisher.current = createViewContextPublisher({
      publish: (viewContext, sequence) =>
        api.publishThreadViewContext({ threadId: id, sequence, viewContext }),
    });
    return () => {
      publisher.current?.dispose();
      publisher.current = null;
    };
  }, [enabled, api, threadId]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync, react/exhaustive-effect-dependencies -- publishes to the server, which the agent reads; re-sends to the publisher made for a new thread
  useEffect(() => publisher.current?.update(context), [context, enabled, api, threadId]);
}
