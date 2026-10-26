import type {
  EnvironmentId,
  OrchestrationV2ConversationMessage,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { type ComponentProps, useLayoutEffect } from "react";
import { useIncrementalTimelineEntries } from "../../hooks/useIncrementalTimelineEntries";
import type { TimelineEntriesInput, TimelineEntry } from "../../session-logic";
import { useThreadVisibleTurnItems } from "../../state/entities";
import {
  peekRememberedThreadTimeline,
  rememberReadyThreadTimeline,
  resolveThreadSwitchTimeline,
  timelineHasEphemeralPreviewUrls,
} from "../ChatView.logic";
import { useT3TeamTimelineArtifacts } from "~/t3team/chat/t3team-useTimelineArtifacts";
import { MessagesTimeline } from "./MessagesTimeline";

/**
 * The timeline with the streamed text. ChatView reads the thread through its quiet
 * atoms, which hold through text deltas; this reads the live turn items, so a
 * delta re-renders the timeline without re-rendering ChatView.
 */
export function ThreadTimeline({
  threadDetailRef,
  entriesInput,
  draftEntries,
  t3teamArtifacts,
  activeThreadKey,
  syncing,
  detailLoading,
  readyMarkdownCwd,
  readyWorkspaceRoot,
  ...timelineProps
}: Omit<ComponentProps<typeof MessagesTimeline>, "timelineEntries"> & {
  /** Null until the thread's detail may load; see resolveThreadDetailRef. */
  threadDetailRef: ScopedThreadRef | null;
  entriesInput: Omit<TimelineEntriesInput, "visibleTurnItems">;
  /** A local draft's optimistic rows; null for a server thread. */
  draftEntries: ReadonlyArray<TimelineEntry> | null;
  /** t3team: what joins the thread's fork artifacts onto the streamed entries (`threadId` null for a draft). */
  t3teamArtifacts: {
    readonly environmentId: EnvironmentId;
    readonly threadId: ThreadId | null;
    readonly messages: ReadonlyArray<OrchestrationV2ConversationMessage> | undefined;
  };
  activeThreadKey: string | null;
  syncing: boolean;
  detailLoading: boolean;
  readyMarkdownCwd: string | null;
  readyWorkspaceRoot: string | null;
}) {
  const visibleTurnItems = useThreadVisibleTurnItems(threadDetailRef);
  const serverEntries = useIncrementalTimelineEntries(activeThreadKey, {
    ...entriesInput,
    visibleTurnItems,
  });
  // t3team: this derivation replaces ChatView's, so the fork artifacts (plan / decision cards,
  // widgets, recorder-note ext) must be joined here or the rich rows fall back to bare text.
  const t3teamTimeline = useT3TeamTimelineArtifacts({ ...t3teamArtifacts, entries: serverEntries });
  const entries = draftEntries ?? t3teamTimeline.entries;
  const displayed = resolveThreadSwitchTimeline({
    loading: entries.length === 0 && syncing,
    activeThreadKey,
    nextEntries: entries,
    rememberedForActive: peekRememberedThreadTimeline<typeof entries>(activeThreadKey),
  });
  useLayoutEffect(() => {
    if (detailLoading || entries.length === 0 || timelineHasEphemeralPreviewUrls(entries)) {
      return;
    }
    rememberReadyThreadTimeline({
      threadKey: activeThreadKey,
      entries,
      markdownCwd: readyMarkdownCwd,
      workspaceRoot: readyWorkspaceRoot,
    });
  }, [activeThreadKey, detailLoading, entries, readyMarkdownCwd, readyWorkspaceRoot]);
  return <MessagesTimeline {...timelineProps} timelineEntries={displayed.entries} />;
}
