import { useCallback } from "react";
import type { MouseEvent } from "react";

import { readLocalApi } from "~/localApi";
import { useAddToChat } from "~/t3team/hooks/t3team-useAddToChat";
import { useT3TeamPinnedSidebarStore } from "~/t3team/t3team-pinnedSidebarStore";
import { useT3TeamSidebarNavPreferencesStore } from "~/t3team/t3team-sidebarNavPreferencesStore";
import type {
  AgentContextActionRunOptions,
  AgentContextCapabilities,
} from "~/t3team/t3team-agentContext";

function mapContextMenuActions(capabilities: AgentContextCapabilities) {
  return capabilities.actions.map((action) => ({ id: action.id, label: action.label }));
}

export function useAgentContext() {
  const { addToChatFromRequest } = useAddToChat();
  const pinItem = useT3TeamPinnedSidebarStore((state) => state.pinItem);
  const unpinItems = useT3TeamPinnedSidebarStore((state) => state.unpinItems);
  const showSidebarItemsAtTop = useT3TeamSidebarNavPreferencesStore(
    (state) => state.showItemsAtTop,
  );
  const removeSidebarItemsFromOrder = useT3TeamSidebarNavPreferencesStore(
    (state) => state.removeItemsFromOrder,
  );

  const runAgentContextAction = useCallback(
    async (
      capabilities: AgentContextCapabilities,
      actionId: string,
      options?: AgentContextActionRunOptions,
    ): Promise<boolean> => {
      const action = capabilities.actions.find((candidate) => candidate.id === actionId);
      if (!action) {
        return false;
      }

      switch (action.kind) {
        case "add-to-chat": {
          await addToChatFromRequest(action.request, options?.addToChatTarget);
          return true;
        }
        case "pin-to-sidebar": {
          pinItem(action.item);
          showSidebarItemsAtTop(
            action.item.projectId,
            action.prioritizeItemIds ?? [action.item.id],
          );
          return true;
        }
        case "unpin-from-sidebar": {
          const cascadeItemIds = action.cascadeItemIds ?? [action.item.id];
          unpinItems(cascadeItemIds);
          removeSidebarItemsFromOrder(action.item.projectId, cascadeItemIds);
          return true;
        }
      }
    },
    [addToChatFromRequest, pinItem, removeSidebarItemsFromOrder, showSidebarItemsAtTop, unpinItems],
  );

  const showAgentContextMenuAt = useCallback(
    async (input: {
      capabilities: AgentContextCapabilities;
      x: number;
      y: number;
      options?: AgentContextActionRunOptions;
    }): Promise<boolean> => {
      if (input.capabilities.actions.length === 0) {
        return false;
      }

      const localApi = readLocalApi();
      if (!localApi) {
        return false;
      }

      const actionId = await localApi.contextMenu.show(mapContextMenuActions(input.capabilities), {
        x: input.x,
        y: input.y,
      });
      if (!actionId) {
        return false;
      }

      return runAgentContextAction(input.capabilities, actionId, input.options);
    },
    [runAgentContextAction],
  );

  const showAgentContextMenu = useCallback(
    async (
      event: MouseEvent,
      capabilities: AgentContextCapabilities,
      options?: AgentContextActionRunOptions,
    ): Promise<boolean> => {
      event.preventDefault();
      event.stopPropagation();

      return showAgentContextMenuAt({
        capabilities,
        x: event.clientX,
        y: event.clientY,
        ...(options ? { options } : {}),
      });
    },
    [showAgentContextMenuAt],
  );

  return {
    runAgentContextAction,
    showAgentContextMenu,
    showAgentContextMenuAt,
  };
}
