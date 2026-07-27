/**
 * The Description section header's "ask the agent to rewrite this" affordance.
 *
 * Matches the language of the section's other header control (`WorkItemChildren`'s "Add child"):
 * ghost/xs button, a `lucide-react` icon at `size-3.5`, then a label — no sparkle/wand iconography,
 * because the review step (not the icon) is what makes this trustworthy.
 */

import { PencilLine } from "lucide-react";

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
        {isStarting ? <Spinner className="size-3.5" /> : <PencilLine className="size-3.5" />}
        Rewrite with agent
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
