import type { ScopedThreadRef } from "@t3tools/contracts";
import { useRef } from "react";

import {
  threadContextDropTargetProps,
  useThreadContextDrop,
} from "~/components/chat/threadContextDrag";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useBackend } from "~/t3team/backend/t3team-index";
import {
  addAgentContextToThread,
  readAddToChatRequest,
} from "~/t3team/t3team-addAgentContextToThread";
import { addThreadContextsToThread } from "~/t3team/t3team-addThreadContextsToThread";
import {
  T3TeamAgentContextDropOverlay,
  useT3TeamAgentContextDropTarget,
} from "~/t3team/t3team-agentContextDrag";
import { isTeamShellEnvironment } from "~/t3team/t3team-upstreamRouteBridge";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

const THREAD_CONTEXT_OVER_CLASS_NAME =
  "data-[thread-context-over]:bg-sidebar-row-hover data-[thread-context-over]:ring-1 data-[thread-context-over]:ring-inset data-[thread-context-over]:ring-primary/70";

/**
 * Makes a sidebar thread row take both drags: a work item or activity item dragged from the Team
 * surfaces, and a thread dragged from the sidebar. A drop opens the thread with the item in its
 * composer; the user still sends. `dropRef` goes on the row element that gets `rowDropProps`.
 */
export function useThreadRowDropTarget(input: {
  threadRef: ScopedThreadRef;
  projectId: string;
  title: string;
  /** Distinguishes row layouts: each renders its own element, which the thread-context listener must follow. */
  layoutKey: string;
  onOpenThread: (threadRef: ScopedThreadRef) => void;
}) {
  const { threadRef, projectId, title, layoutKey, onOpenThread } = input;
  const enabled = useFeatureFlag("UI_SIDEBAR_THREAD_DROP");
  const backend = useBackend();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const dropRef = useRef<HTMLElement | null>(null);

  // Only a primary-environment thread opens in the Team thread view that shows queued context;
  // other environments' threads open on upstream's route, which does not read the queue.
  const acceptsAgentContext =
    enabled && isTeamShellEnvironment(threadRef.environmentId, primaryEnvironmentId);
  const { isActive, dropProps } = useT3TeamAgentContextDropTarget({
    canDrop: (record) =>
      acceptsAgentContext && readAddToChatRequest(record.capabilities)?.projectId === projectId,
    onDropRecord: (record) => {
      if (
        addAgentContextToThread({
          capabilities: record.capabilities,
          threadId: threadRef.threadId,
          backend,
        })
      ) {
        onOpenThread(threadRef);
      }
    },
    dropEffect: "copy",
  });

  useThreadContextDrop(
    dropRef,
    threadRef.environmentId,
    `${threadRef.threadId}:${layoutKey}`,
    (refs) => {
      if (enabled && addThreadContextsToThread(threadRef, refs)) onOpenThread(threadRef);
    },
  );

  return {
    dropRef,
    rowDropProps: enabled ? { ...dropProps, ...threadContextDropTargetProps() } : {},
    rowDropClassName: enabled ? THREAD_CONTEXT_OVER_CLASS_NAME : undefined,
    rowDropOverlay: (
      <T3TeamAgentContextDropOverlay
        active={isActive}
        label={`Drop to add to “${title}”`}
        className="rounded-md"
        labelClassName="inset-x-1.5 top-1/2 -translate-y-1/2 truncate bg-background py-0.5"
      />
    ),
  };
}
