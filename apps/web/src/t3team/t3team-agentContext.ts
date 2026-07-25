import type { AddToChatTarget } from "~/t3team/hooks/t3team-useAddToChat";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import type {
  T3TeamSidebarPinnedItem,
  T3TeamSidebarPinActionState,
} from "~/t3team/t3team-sidebarPinningTypes";

export type AgentContextToolDefinition = {
  id: string;
  label: string;
  description?: string;
};

export type AgentContextActionDefinition =
  | {
      id: string;
      label: string;
      kind: "add-to-chat";
      request: AddToChatRequest;
    }
  | {
      id: string;
      label: string;
      kind: "pin-to-sidebar";
      item: T3TeamSidebarPinnedItem;
      prioritizeItemIds?: readonly string[];
    }
  | {
      id: string;
      label: string;
      kind: "unpin-from-sidebar";
      item: T3TeamSidebarPinnedItem;
      cascadeItemIds?: readonly string[];
    };

export type AgentContextCapabilities = {
  actions: readonly AgentContextActionDefinition[];
  tools?: readonly AgentContextToolDefinition[];
};

export type AgentContextActionRunOptions = {
  addToChatTarget?: AddToChatTarget;
};

export function getSidebarItemFromAgentContextCapabilities(
  capabilities: AgentContextCapabilities,
): T3TeamSidebarPinnedItem | null {
  for (const action of capabilities.actions) {
    if (action.kind === "pin-to-sidebar" || action.kind === "unpin-from-sidebar") {
      return action.item;
    }
  }

  return null;
}

export function buildAddToChatAgentContextCapabilities(
  request: AddToChatRequest,
  options?: {
    sidebarPin?: T3TeamSidebarPinActionState;
  },
): AgentContextCapabilities {
  const actions: AgentContextActionDefinition[] = [
    {
      id: "add-to-chat",
      label: "Add to chat",
      kind: "add-to-chat",
      request,
    },
  ];

  if (options?.sidebarPin) {
    const showUnpinAction = options.sidebarPin.pinned;
    actions.push(
      showUnpinAction
        ? {
            id: "unpin",
            label: options.sidebarPin.unpinLabel ?? "Unpin",
            kind: "unpin-from-sidebar",
            item: options.sidebarPin.item,
            ...(options.sidebarPin.cascadeItemIds
              ? { cascadeItemIds: options.sidebarPin.cascadeItemIds }
              : {}),
          }
        : {
            id: "pin-to-left",
            label: options.sidebarPin.pinLabel ?? "Pin to left",
            kind: "pin-to-sidebar",
            item: options.sidebarPin.item,
            ...(options.sidebarPin.prioritizeItemIds
              ? { prioritizeItemIds: options.sidebarPin.prioritizeItemIds }
              : {}),
          },
    );
  }

  return {
    actions,
  };
}
