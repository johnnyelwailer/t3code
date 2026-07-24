import { useMemo } from "react";

import type { AddToChatTarget } from "~/t3team/hooks/t3team-useAddToChat";
import { useAddToChat } from "~/t3team/hooks/t3team-useAddToChat";
import {
  T3TeamAgentContextDropOverlay,
  useT3TeamAgentContextDropTarget,
} from "~/t3team/t3team-agentContextDrag";

export function useAddToChatComposerDropTarget(target?: AddToChatTarget) {
  const { addToChatFromRequest } = useAddToChat();
  const { isActive, dropProps } = useT3TeamAgentContextDropTarget({
    canDrop: (record) =>
      record.capabilities.actions.some((action) => action.kind === "add-to-chat"),
    onDropRecord: async (record) => {
      const action = record.capabilities.actions.find(
        (candidate) => candidate.kind === "add-to-chat",
      );
      if (action?.kind !== "add-to-chat") {
        return;
      }

      await addToChatFromRequest(action.request, target);
    },
    dropEffect: "copy",
  });

  return useMemo(
    () => ({
      composerContainerProps: dropProps,
      composerContainerOverlay: (
        <T3TeamAgentContextDropOverlay
          active={isActive}
          label="Drop to add this item to the chat"
          className="rounded-[20px]"
        />
      ),
    }),
    [dropProps, isActive],
  );
}
