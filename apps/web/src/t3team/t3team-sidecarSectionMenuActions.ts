import type { SidecarSectionAction } from "@t3tools/project-recipes";

export type T3TeamSidecarMenuEntry =
  | {
      readonly kind: "action";
      readonly id: string;
      readonly label: string;
      readonly onSelect: () => void;
      readonly disabled?: boolean | undefined;
      readonly variant?: "default" | "destructive" | undefined;
    }
  | {
      readonly kind: "separator";
      readonly id: string;
    };

function mapDeclaredActions(
  actions: ReadonlyArray<SidecarSectionAction> | undefined,
  onRunDeclaredAction: (action: SidecarSectionAction) => void,
): ReadonlyArray<T3TeamSidecarMenuEntry> {
  return (actions ?? []).map((action) => ({
    kind: "action" as const,
    id: action.id,
    label: action.label,
    onSelect: () => onRunDeclaredAction(action),
  }));
}

export function buildT3TeamSidecarSectionHeaderMenuEntries(input: {
  readonly collapsed: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onToggleCollapsed: () => void;
  readonly showResetSection?: boolean | undefined;
  readonly onResetSection?: (() => void) | undefined;
  readonly onHideSection: () => void;
  readonly declaredActions?: ReadonlyArray<SidecarSectionAction> | undefined;
  readonly onRunDeclaredAction: (action: SidecarSectionAction) => void;
}): ReadonlyArray<T3TeamSidecarMenuEntry> {
  const declaredEntries = mapDeclaredActions(input.declaredActions, input.onRunDeclaredAction);

  return [
    {
      kind: "action",
      id: "move-up",
      label: "Move up",
      onSelect: input.onMoveUp,
      disabled: !input.canMoveUp,
    },
    {
      kind: "action",
      id: "move-down",
      label: "Move down",
      onSelect: input.onMoveDown,
      disabled: !input.canMoveDown,
    },
    {
      kind: "action",
      id: "toggle-collapsed",
      label: input.collapsed ? "Expand section" : "Collapse section",
      onSelect: input.onToggleCollapsed,
    },
    ...(input.showResetSection && input.onResetSection
      ? [
          {
            kind: "action" as const,
            id: "reset-section",
            label: "Reset section",
            onSelect: input.onResetSection,
          },
        ]
      : []),
    {
      kind: "action",
      id: "hide-section",
      label: "Hide section",
      onSelect: input.onHideSection,
      variant: "destructive",
    },
    ...(declaredEntries.length > 0
      ? [{ kind: "separator" as const, id: "declared-separator" }]
      : []),
    ...declaredEntries,
  ];
}

export function buildT3TeamSidecarItemMenuEntries(input: {
  readonly pinned: boolean;
  readonly onPinItem: () => void;
  readonly onUnpinItem: () => void;
  readonly editSourcePath?: string | undefined;
  readonly onEditItem?: ((sourcePath: string) => void) | undefined;
  readonly showCustomizeItem?: boolean | undefined;
  readonly onCustomizeItem?: (() => void) | undefined;
  readonly onHideItem: () => void;
  readonly declaredActions?: ReadonlyArray<SidecarSectionAction> | undefined;
  readonly onRunDeclaredAction: (action: SidecarSectionAction) => void;
}): ReadonlyArray<T3TeamSidecarMenuEntry> {
  const declaredEntries = mapDeclaredActions(input.declaredActions, input.onRunDeclaredAction);

  return [
    {
      kind: "action",
      id: input.pinned ? "unpin-item" : "pin-item",
      label: input.pinned ? "Unpin item" : "Pin item",
      onSelect: input.pinned ? input.onUnpinItem : input.onPinItem,
    },
    ...(input.editSourcePath && input.onEditItem
      ? [
          {
            kind: "action" as const,
            id: "edit-item",
            label: "Edit this…",
            onSelect: () => input.onEditItem?.(input.editSourcePath!),
          },
        ]
      : []),
    ...(input.showCustomizeItem && input.onCustomizeItem
      ? [
          {
            kind: "action" as const,
            id: "customize-item",
            label: "Customize…",
            onSelect: input.onCustomizeItem,
          },
        ]
      : []),
    {
      kind: "action",
      id: "hide-item",
      label: "Hide item",
      onSelect: input.onHideItem,
      variant: "destructive",
    },
    ...(declaredEntries.length > 0
      ? [{ kind: "separator" as const, id: "declared-separator" }]
      : []),
    ...declaredEntries,
  ];
}
