import type { ServerProviderSkill } from "@t3tools/contracts";

import {
  ComposerPromptEditor,
  type ComposerPromptEditorHandle,
} from "~/components/ComposerPromptEditor";
import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import { ComposerCommandMenu } from "~/components/chat/ComposerCommandMenu";
import { useTheme } from "~/hooks/useTheme";
import { T3workComposerSlashMenu } from "~/t3work/composer/t3work-ComposerSlashMenuGroups";
import type { useT3workKickoffComposerMenu } from "~/t3work/composer/t3work-useKickoffComposerMenu";

type KickoffComposerCommandMenu = ReturnType<typeof useT3workKickoffComposerMenu>;

type KickoffComposerEditorProps = {
  readonly editorRef: React.RefObject<ComposerPromptEditorHandle | null>;
  readonly text: string;
  readonly cursor: number;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly commandMenu: KickoffComposerCommandMenu;
  readonly onChangeText: (nextValue: string, nextCursor: number) => void;
};

/**
 * Kickoff composer editor surface: the prompt editor plus the shared `/`, `@`
 * and `$` command menu, positioned above the editor exactly as the chat
 * composer positions its own menu.
 */
export function KickoffComposerEditor(props: KickoffComposerEditorProps) {
  const { resolvedTheme } = useTheme();
  const { commandMenu } = props;

  return (
    <div className="relative px-3 pb-2 pt-3.5 sm:px-4 sm:pt-4">
      {commandMenu.menuOpen ? (
        <div className="absolute inset-x-0 bottom-full z-20 mb-2">
          {commandMenu.trigger?.kind === "slash-command" ? (
            <T3workComposerSlashMenu
              items={commandMenu.menuItems}
              activeItemId={commandMenu.activeItemId}
              onHighlightedItemChange={commandMenu.onHighlightedItemChange}
              onSelect={commandMenu.selectItem}
            />
          ) : (
            <ComposerCommandMenu
              items={commandMenu.menuItems.filter(
                (item): item is ComposerCommandItem => item.type !== "recipe-slash-command",
              )}
              resolvedTheme={resolvedTheme}
              isLoading={commandMenu.isPathSearchPending}
              triggerKind={commandMenu.trigger?.kind ?? null}
              activeItemId={commandMenu.activeItemId}
              onHighlightedItemChange={commandMenu.onHighlightedItemChange}
              onSelect={commandMenu.selectItem}
            />
          )}
        </div>
      ) : null}
      <ComposerPromptEditor
        editorRef={props.editorRef}
        value={props.text}
        cursor={props.cursor}
        terminalContexts={[]}
        skills={props.skills}
        onRemoveTerminalContext={() => {}}
        onChange={(nextValue, nextCursor, expandedCursor, cursorAdjacentToMention) => {
          props.onChangeText(nextValue, nextCursor);
          commandMenu.handleEditorChange(nextValue, expandedCursor, cursorAdjacentToMention);
        }}
        onCommandKeyDown={(key) => commandMenu.handleCommandKeyDown(key)}
        onPaste={() => {}}
        placeholder={props.placeholder}
        disabled={props.disabled}
      />
    </div>
  );
}
