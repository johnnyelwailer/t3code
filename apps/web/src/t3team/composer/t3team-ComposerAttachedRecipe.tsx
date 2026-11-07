/**
 * The recipe attached to this composer, shown above the input with a remove control. Renders in
 * every ChatView (route, side chat, draft) because it is keyed by the composer's draft target.
 */
import { TicketKickoffComposerSelectedRecipe } from "~/t3team/t3team-TicketKickoffComposerSelectedRecipe";
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
  return (
    <div data-t3team-composer-attached-recipe="true" className="w-full pb-2">
      <TicketKickoffComposerSelectedRecipe
        selectedRecipe={attached}
        onClearSelectedRecipe={() => detachT3TeamComposerRecipe(props.target)}
      />
    </div>
  );
}
