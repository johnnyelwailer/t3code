import type { LegendListRef } from "@legendapp/list/react";
import { type RefObject, useEffect, useRef } from "react";

import type { T3TeamTimelineRowProps } from "~/t3team/chat/t3team-timelineRowProps";

/**
 * Scrolls the virtualized timeline to a workflow card the dock asked for — once per
 * `requestId`. The request is never cleared by the host and `rows` changes identity on every
 * live update (a running workflow pushes progress every few seconds), so without the consumed
 * id the effect would yank the user back to the card for the whole run. It only marks a request
 * consumed once the row exists, so a request that lands before its row renders still retries.
 */
export function useT3TeamWorkflowCardNavigation(input: {
  readonly request: T3TeamTimelineRowProps["workflowCardNavigationRequest"];
  readonly rows: ReadonlyArray<{
    readonly kind: string;
    readonly message?: { readonly id: string };
  }>;
  readonly listRef: RefObject<LegendListRef | null>;
  readonly onManualNavigation: () => void;
}) {
  const { request, rows, listRef, onManualNavigation } = input;
  const consumedRequestId = useRef<number | null>(null);
  useEffect(() => {
    if (!request || consumedRequestId.current === request.requestId) return;
    const index = rows.findIndex(
      (row) => row.kind === "message" && row.message?.id === request.messageId,
    );
    if (index < 0) return;
    consumedRequestId.current = request.requestId;
    onManualNavigation();
    void listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0, viewOffset: 24 });
  }, [listRef, onManualNavigation, request, rows]);
}
