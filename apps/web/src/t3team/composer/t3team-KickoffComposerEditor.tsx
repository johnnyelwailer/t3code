import { useId, useRef } from "react";
import type { ServerProviderSkill } from "@t3tools/contracts";

import {
  ComposerPromptEditor,
  type ComposerPromptEditorHandle,
} from "~/components/ComposerPromptEditor";
import { ComposerCommandMenu } from "~/components/chat/ComposerCommandMenu";
import { useTheme } from "~/hooks/useTheme";
import { t3teamComposerMenuOptionDomId } from "~/t3team/composer/t3team-composerMenuKeyboard";
import { useT3TeamComposerActiveDescendant } from "~/t3team/composer/t3team-useComposerActiveDescendant";
import type { useT3TeamKickoffComposerMenu } from "~/t3team/composer/t3team-useKickoffComposerMenu";

type KickoffComposerCommandMenu = ReturnType<typeof useT3TeamKickoffComposerMenu>;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const listboxId = `t3team-composer-menu${reactId}`;

  useT3TeamComposerActiveDescendant({
    containerRef,
    listboxId,
    menuOpen: commandMenu.menuOpen,
    activeOptionDomId: commandMenu.activeItemId
      ? t3teamComposerMenuOptionDomId(listboxId, commandMenu.activeItemId)
      : null,
  });

  return (
    <div
      ref={containerRef}
      className="relative px-3 pb-2 pt-3.5 sm:px-4 sm:pt-4"
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" || !commandMenu.menuOpen) return;
        if (!commandMenu.handleCommandKeyDown("Escape")) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {commandMenu.menuOpen ? (
        <div className="absolute inset-x-0 bottom-full z-20 mb-2">
          <ComposerCommandMenu
            items={commandMenu.menuItems}
            resolvedTheme={resolvedTheme}
            isLoading={commandMenu.isPathSearchPending}
            triggerKind={commandMenu.trigger?.kind ?? null}
            listboxId={listboxId}
            activeItemId={commandMenu.activeItemId}
            onHighlightedItemChange={commandMenu.onHighlightedItemChange}
            onSelect={commandMenu.selectItem}
          />
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
