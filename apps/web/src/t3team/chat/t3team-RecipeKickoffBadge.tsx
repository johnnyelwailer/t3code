import { WorkflowIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import type { ChatMessage } from "~/types";

/** Marks a recipe row in the composer's `/` menu, next to where skills show their source. */
export function T3TeamRecipeMenuBadge() {
  return (
    <Badge className="ms-auto" variant="info">
      <WorkflowIcon aria-hidden="true" />
      Recipe
    </Badge>
  );
}

/** On a sent user message: the recipe the person attached when sending it. */
export function T3TeamRecipeKickoffBadge(props: {
  readonly message: Pick<ChatMessage, "t3teamExt">;
}) {
  const kickoff = props.message.t3teamExt?.recipeKickoff;
  if (kickoff === undefined) return null;
  return (
    <div className="mb-1.5 flex min-w-0" data-t3team-recipe-kickoff={kickoff.recipeId}>
      <Badge className="min-w-0 max-w-full" variant="info" size="sm" title={kickoff.title}>
        <WorkflowIcon aria-hidden="true" />
        <span className="min-w-0 truncate">Recipe · {kickoff.title}</span>
      </Badge>
    </div>
  );
}
