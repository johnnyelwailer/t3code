/**
 * The recipe attached to this composer: one line above the input, the description on hover.
 * Keyed by the composer's draft target, so route views, side chats and drafts each show their own.
 */
import { WorkflowIcon, XIcon } from "lucide-react";

import { ContextChip, ContextChipAction, ContextChipLabel } from "~/components/ContextChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  detachT3TeamComposerRecipe,
  useT3TeamComposerAttachedRecipe,
  type T3TeamComposerRecipeTarget,
} from "~/t3team/composer/t3team-composerAttachedRecipeStore";

export function T3TeamComposerAttachedRecipe(props: {
  readonly target: T3TeamComposerRecipeTarget;
}) {
  const attached = useT3TeamComposerAttachedRecipe(props.target);
  if (attached === null) return null;
  const { recipe } = attached;
  return (
    <div data-t3team-composer-attached-recipe="true" className="flex min-w-0 px-3 pb-1.5 text-xs">
      <ContextChip className="gap-1.5 rounded-md border border-border bg-background/80 px-2 py-1 text-foreground backdrop-blur-md">
        <Tooltip>
          <TooltipTrigger
            render={<span tabIndex={0} className="flex min-w-0 items-center gap-1.5 rounded-sm" />}
          >
            <WorkflowIcon aria-hidden="true" className="text-info-foreground" />
            <ContextChipLabel>{recipe.title}</ContextChipLabel>
          </TooltipTrigger>
          <TooltipPopup side="top" align="start" className="max-w-80">
            <div className="font-medium">{recipe.title}</div>
            {recipe.description ? (
              <div className="text-muted-foreground">{recipe.description}</div>
            ) : null}
          </TooltipPopup>
        </Tooltip>
        <ContextChipAction
          aria-label={`Remove recipe ${recipe.title}`}
          onClick={() => detachT3TeamComposerRecipe(props.target)}
        >
          <XIcon />
        </ContextChipAction>
      </ContextChip>
    </div>
  );
}
