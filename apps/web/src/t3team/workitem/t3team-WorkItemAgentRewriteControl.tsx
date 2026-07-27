/**
 * The Description section header's `Rewrite` affordance.
 *
 * Matches the language of the section's other header controls (`WorkItemChildren`'s "Add child",
 * `WorkItemLinks`' "Add link"): ghost/xs button, one `lucide-react` glyph at `size-3.5`, then a
 * one-word label. The glyph is `Bot` — the same mark the draft strip and the draft diff already
 * use for agent-authored content on this page — so it reads as "this hands the section to the
 * agent" rather than as a sparkle bolted onto an ordinary button.
 *
 * Colour comes from the button variant (`currentColor`); no palette values live here, so light and
 * dark follow the theme tokens.
 */

import { Bot } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";
import {
  useWorkItemAgentRewrite,
  type UseWorkItemAgentRewriteInput,
} from "~/t3team/workitem/t3team-useWorkItemAgentRewrite";

export function WorkItemAgentRewriteControl(props: UseWorkItemAgentRewriteInput) {
  const { start, isStarting, error, isDisabled } = useWorkItemAgentRewrite(props);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="xs" disabled={isDisabled} onClick={start}>
        {isStarting ? <Spinner className="size-3.5" /> : <Bot className="size-3.5" />}
        Rewrite
      </Button>
      {error ? (
        <T3TeamErrorStateInline
          userFacing={error}
          showRetry={error.canRetry}
          onRetry={start}
          className="max-w-64"
        />
      ) : null}
    </div>
  );
}
