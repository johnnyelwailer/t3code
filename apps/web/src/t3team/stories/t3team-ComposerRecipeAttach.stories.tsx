import type { Meta, StoryObj } from "@storybook/react";
import { useId, useRef, useState } from "react";

import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "~/components/ComposerPromptEditorTiptap";
import {
  ComposerCommandMenu,
  composerSuggestionOptionId,
  type ComposerCommandItem,
} from "~/components/chat/ComposerCommandMenu";
import { ComposerSurface } from "~/components/chat/ComposerSurface";
import { UserMessageRow } from "~/components/chat/TimelineUserMessageRow";
import { TimelineRowCtx } from "~/components/chat/timelineRowContext";
import { EMPTY_COMPOSER_CONTEXT_RECORDS } from "~/components/composerContextPresentation";
import { detectComposerTrigger } from "~/composer-logic";
import { DraftId } from "~/composerDraftStore";
import { useTheme } from "~/hooks/useTheme";
import { T3TeamComposerAttachedRecipe } from "~/t3team/composer/t3team-ComposerAttachedRecipe";
import {
  attachT3TeamComposerRecipe,
  detachT3TeamComposerRecipe,
} from "~/t3team/composer/t3team-composerAttachedRecipeStore";
import { appendT3TeamRecipeMenuItems } from "~/t3team/composer/t3team-composerRecipeMenuItems";
import {
  STORY_PROVIDER_SLASH_COMMANDS,
  STORY_RECIPES,
  STORY_TIMELINE_STATE,
  hostSlashItemsFor,
  storyUserMessage,
} from "~/t3team/stories/t3team-composerRecipeAttach.storyFixtures";

/**
 * Real menu, editor, composer surface, attached-recipe store and `UserMessageRow`. `ChatComposer`
 * itself needs a live environment, so host `/` items are fixtures ranked by its real search.
 */
function ComposerRecipeAttachPreview(props: {
  readonly width: number;
  readonly initialText: string;
  readonly attachedRecipeIndex?: number;
}) {
  const reactId = useId();
  const [target] = useState(() => {
    const draft = DraftId.make(`storybook-composer${reactId}`);
    const attached =
      props.attachedRecipeIndex === undefined
        ? undefined
        : STORY_RECIPES[props.attachedRecipeIndex];
    if (attached) attachT3TeamComposerRecipe(draft, attached);
    else detachT3TeamComposerRecipe(draft);
    return draft;
  });
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
  const [text, setText] = useState(props.initialText);
  const [cursor, setCursor] = useState(props.initialText.length);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const trigger = detectComposerTrigger(text, cursor);
  const items = appendT3TeamRecipeMenuItems({
    items: hostSlashItemsFor(trigger),
    trigger,
    recipes: STORY_RECIPES,
    providerSlashCommands: STORY_PROVIDER_SLASH_COMMANDS,
  });
  const menuOpen = trigger?.kind === "slash-command";
  const activeItemId = items.find((item) => item.id === highlightedId)?.id ?? items[0]?.id ?? null;
  const listId = `story-composer-menu${reactId}`;

  const onSelect = (item: ComposerCommandItem) => {
    if (item.type !== "recipe-slash-command" || trigger === null) return;
    const next = text.slice(0, trigger.rangeStart) + text.slice(trigger.rangeEnd);
    setText(next);
    setCursor(trigger.rangeStart);
    attachT3TeamComposerRecipe(target, item.recipe);
  };

  return (
    <div
      className="flex h-[640px] flex-col justify-end overflow-hidden rounded-lg border border-border bg-background p-3"
      style={{ width: props.width }}
    >
      <div className="relative mx-auto w-full max-w-(--chat-content-max-width)">
        <T3TeamComposerAttachedRecipe target={target} />
        <ComposerSurface.Shell>
          <ComposerSurface.Host>
            <ComposerSurface.Main>
              <div className="relative px-3 pt-3.5 pb-2 sm:px-4 sm:pt-4">
                {menuOpen ? (
                  <div className="absolute inset-x-0 bottom-full z-20 mb-2">
                    <ComposerCommandMenu
                      listId={listId}
                      items={items}
                      resolvedTheme={resolvedTheme}
                      isLoading={false}
                      triggerKind="slash-command"
                      activeItemId={activeItemId}
                      onHighlightedItemChange={setHighlightedId}
                      onSelect={onSelect}
                    />
                  </div>
                ) : null}
                <ComposerPromptEditorTiptap
                  editorRef={editorRef}
                  value={text}
                  cursor={cursor}
                  contextRecords={EMPTY_COMPOSER_CONTEXT_RECORDS}
                  skills={[]}
                  disabled={false}
                  placeholder="Ask anything, @tag files/folders, or use / to show available commands"
                  suggestionListId={listId}
                  activeSuggestionId={
                    menuOpen && activeItemId
                      ? composerSuggestionOptionId(listId, activeItemId)
                      : undefined
                  }
                  onChange={(nextValue, nextCursor) => {
                    setText(nextValue);
                    setCursor(nextCursor);
                  }}
                  onPaste={() => undefined}
                />
              </div>
            </ComposerSurface.Main>
          </ComposerSurface.Host>
        </ComposerSurface.Shell>
      </div>
    </div>
  );
}

const PLAIN_MESSAGE = storyUserMessage({
  id: "story-message-plain",
  text: "Die Freigabe hängt seit gestern bei drei Lieferanten aus dem Kanton Zug.",
  createdAt: "2026-11-07T09:12:00.000Z",
});

const RECIPE_MESSAGE = storyUserMessage({
  id: "story-message-recipe",
  text: "Bitte nur Verträge ab 2025 berücksichtigen und Abweichungen unter fünf Tagen ignorieren.",
  createdAt: "2026-11-07T09:14:00.000Z",
  recipe: STORY_RECIPES[0],
});

function RecipeKickoffTimelinePreview(props: { readonly width: number }) {
  const { resolvedTheme } = useTheme();
  return (
    <TimelineRowCtx value={{ ...STORY_TIMELINE_STATE, resolvedTheme }}>
      <div
        className="flex flex-col gap-4 rounded-lg border border-border bg-background @container p-4"
        style={{ width: props.width }}
      >
        {[PLAIN_MESSAGE, RECIPE_MESSAGE].map((message) => (
          <UserMessageRow
            key={message.id}
            row={{
              kind: "message",
              id: message.id,
              createdAt: message.createdAt,
              message,
              showAssistantMeta: false,
              showAssistantTimestamp: false,
              showAssistantCopyButton: false,
              assistantCopyStreaming: false,
            }}
          />
        ))}
      </div>
    </TimelineRowCtx>
  );
}

const meta = {
  title: "T3Team/Composer Recipe Attach",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** `/` right after typing: 14 recipes follow the built-ins, provider commands and skills. */
export const SlashMenu: Story = {
  render: () => <ComposerRecipeAttachPreview width={760} initialText="/" />,
};

export const SlashMenuDark: Story = { ...SlashMenu, globals: { theme: "dark" } };

/** `/rech` narrows recipes by alias, then id, then title; host matches still lead. */
export const SlashMenuFiltered: Story = {
  render: () => <ComposerRecipeAttachPreview width={760} initialText="/rech" />,
};

export const SlashMenuFilteredDark: Story = { ...SlashMenuFiltered, globals: { theme: "dark" } };

/** A picked recipe sits above the input with a remove control; the note is typed below it. */
export const AttachedRecipe: Story = {
  render: () => (
    <ComposerRecipeAttachPreview
      width={760}
      attachedRecipeIndex={0}
      initialText="Bitte nur Verträge ab 2025 berücksichtigen und Abweichungen unter fünf Tagen ignorieren."
    />
  ),
};

export const AttachedRecipeDark: Story = { ...AttachedRecipe, globals: { theme: "dark" } };

/** The side chat's composer at its narrowest panel width. */
export const AttachedRecipeSideChat: Story = {
  render: () => (
    <ComposerRecipeAttachPreview
      width={320}
      attachedRecipeIndex={3}
      initialText="Fokus auf Fremdwährungen, bitte."
    />
  ),
};

export const AttachedRecipeSideChatDark: Story = {
  ...AttachedRecipeSideChat,
  globals: { theme: "dark" },
};

/** The sent message: the recipe badge sits above the person's own words. */
export const SentMessageBadge: Story = {
  render: () => <RecipeKickoffTimelinePreview width={760} />,
};

export const SentMessageBadgeDark: Story = { ...SentMessageBadge, globals: { theme: "dark" } };

export const SentMessageBadgeSideChat: Story = {
  render: () => <RecipeKickoffTimelinePreview width={320} />,
};

export const SentMessageBadgeSideChatDark: Story = {
  ...SentMessageBadgeSideChat,
  globals: { theme: "dark" },
};
