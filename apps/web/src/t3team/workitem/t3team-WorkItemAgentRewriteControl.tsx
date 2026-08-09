/**
 * The Description section header's `Rewrite` affordance.
 *
 * Matches the language of the section's other header controls (`WorkItemChildren`'s "Add child",
 * `WorkItemLinks`' "Add link"): ghost/xs button, one `lucide-react` glyph at `size-3.5`, then a
 * one-word label. The glyph is `Bot` — the same mark the draft strip and the draft diff already use
 * for agent-authored content on this page — so it reads as "this hands the section to the agent"
 * rather than as a sparkle bolted onto an ordinary button.
 *
 * Clicking opens the note popout IMMEDIATELY. It is `T3TeamCommentPopoutCard`, the same card the diff
 * reviewer gets when it selects a passage — one affordance for "leave a note on this prose", anchored
 * to the button here because the note is about the field as a whole. Nothing is created by the click:
 * the workflow is merely preselected on the composer, and it runs when the composer is submitted.
 *
 * Colour comes from the button variant and the popout card (`currentColor` and semantic tokens); no
 * palette values live here, so light and dark follow the theme.
 */

import { Bot } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { T3TeamCommentPopoutCard } from "~/t3team/workitem/t3team-CommentPopoutCard";
import {
  useWorkItemAgentRewrite,
  type UseWorkItemAgentRewriteInput,
} from "~/t3team/workitem/t3team-useWorkItemAgentRewrite";

export function WorkItemAgentRewriteControl(props: UseWorkItemAgentRewriteInput) {
  const { isComposing, open, cancel, submitComment, stagedCommentCount, error, isDisabled } =
    useWorkItemAgentRewrite(props);

  return (
    <div className="relative flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="xs" disabled={isDisabled} onClick={open}>
        <Bot className="size-3.5" />
        Rewrite
        {stagedCommentCount > 0 ? (
          <span className="rounded bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
            {stagedCommentCount}
          </span>
        ) : null}
      </Button>

      {isComposing ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)]">
          <T3TeamCommentPopoutCard
            placeholder="What should change in the description?"
            submitLabel="Attach"
            ariaLabel="Note for the description rewrite"
            onCancel={cancel}
            onSubmit={submitComment}
          />
        </div>
      ) : null}

      {error ? (
        <T3TeamErrorStateInline
          userFacing={error}
          showRetry={error.canRetry}
          onRetry={open}
          className="max-w-64"
        />
      ) : null}
    </div>
  );
}
