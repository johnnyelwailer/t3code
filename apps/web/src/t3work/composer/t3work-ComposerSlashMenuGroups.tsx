import { BotIcon, SparklesIcon, TerminalIcon } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import {
  Command,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "~/components/ui/command";
import { t3workComposerMenuOptionDomId } from "~/t3work/composer/t3work-composerMenuKeyboard";
import type { T3workComposerMenuItem } from "~/t3work/composer/t3work-composerRecipeSlashItems";

type SlashMenuGroup = {
  readonly id: string;
  readonly label: string;
  readonly items: ReadonlyArray<T3workComposerMenuItem>;
};

/**
 * Groups the `/` menu as the spec fixes them: built-ins, then provider
 * commands, then recipes last so a project recipe can never appear to shadow a
 * host command (docs/t3work-mvp/16-action-recipes.md#menu-grouping).
 */
export function groupT3workSlashMenuItems(
  items: ReadonlyArray<T3workComposerMenuItem>,
): ReadonlyArray<SlashMenuGroup> {
  return (
    [
      { id: "built-in", label: "Built-in", type: "slash-command" },
      { id: "provider", label: "Provider", type: "provider-slash-command" },
      { id: "recipes", label: "Recipes", type: "recipe-slash-command" },
    ] as const
  )
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: items.filter((item) => item.type === group.type),
    }))
    .filter((group) => group.items.length > 0);
}

function SlashMenuGlyph(props: { readonly item: T3workComposerMenuItem }) {
  const className = "size-4 shrink-0 text-muted-foreground/80";
  if (props.item.type === "recipe-slash-command") {
    return <SparklesIcon className={className} />;
  }
  if (props.item.type === "provider-slash-command") {
    return <TerminalIcon className={className} />;
  }
  return <BotIcon className={className} />;
}

/**
 * Slash-menu panel for t3work composer surfaces. Upstream `ComposerCommandMenu`
 * owns the four host item kinds and cannot render the t3work-owned
 * `recipe-slash-command` kind, so slash triggers render here while `@` and `$`
 * keep flowing through the upstream menu.
 */
export function T3workComposerSlashMenu(props: {
  readonly items: ReadonlyArray<T3workComposerMenuItem>;
  readonly listboxId: string;
  readonly activeItemId: string | null;
  readonly onHighlightedItemChange: (itemId: string | null) => void;
  readonly onSelect: (item: T3workComposerMenuItem) => void;
}) {
  const groups = groupT3workSlashMenuItems(props.items);
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemId = props.activeItemId;
  const listboxId = props.listboxId;

  useLayoutEffect(() => {
    if (!activeItemId || !listRef.current) return;
    // Option ids are stable (see t3workComposerMenuOptionDomId), so the active
    // row can be found without escaping the item id into a selector.
    const optionId = t3workComposerMenuOptionDomId(listboxId, activeItemId);
    const option = listRef.current.ownerDocument.getElementById(optionId);
    option?.scrollIntoView?.({ block: "nearest" });
  }, [activeItemId, listboxId]);

  return (
    <Command
      autoHighlight={false}
      mode="none"
      onItemHighlighted={(highlightedValue) => {
        props.onHighlightedItemChange(
          typeof highlightedValue === "string" ? highlightedValue : null,
        );
      }}
    >
      <div
        ref={listRef}
        className="relative w-full overflow-hidden rounded-[20px] border border-border/80 bg-popover/96 shadow-lg/8 backdrop-blur-xs"
      >
        {groups.length > 0 ? (
          <CommandList id={listboxId} role="listbox" className="max-h-72">
            {groups.map((group, groupIndex) => (
              <div key={group.id}>
                {groupIndex > 0 ? <CommandSeparator className="my-0.5" /> : null}
                <CommandGroup>
                  <CommandGroupLabel className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/55">
                    {group.label}
                  </CommandGroupLabel>
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      // Base UI owns `id` on its item props, so the stable
                      // aria-activedescendant target is supplied through the
                      // rendered element instead.
                      render={<div id={t3workComposerMenuOptionDomId(listboxId, item.id)} />}
                      role="option"
                      aria-selected={activeItemId === item.id}
                      data-composer-item-id={item.id}
                      className={cn(
                        "cursor-pointer select-none gap-2 hover:bg-transparent hover:text-inherit data-highlighted:bg-transparent data-highlighted:text-inherit",
                        activeItemId === item.id && "bg-accent! text-accent-foreground!",
                      )}
                      onMouseMove={() => {
                        if (activeItemId !== item.id) props.onHighlightedItemChange(item.id);
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        props.onSelect(item);
                      }}
                    >
                      <SlashMenuGlyph item={item} />
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="shrink-0">{item.label}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground/70 text-xs">
                          {item.description}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        ) : (
          <div className="px-5 py-3.5">
            <p className="text-muted-foreground/70 text-xs">No matching command.</p>
          </div>
        )}
      </div>
    </Command>
  );
}
