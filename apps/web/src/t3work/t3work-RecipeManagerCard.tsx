import type { ManagedProjectRecipe } from "@t3tools/project-recipes";

import { Badge } from "~/t3work/components/ui/t3work-badge";

export function RecipeManagerCard({
  recipe,
  selected,
  onSelect,
}: {
  readonly recipe: ManagedProjectRecipe;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
          : "border-transparent bg-transparent hover:border-border hover:bg-muted/40"
      } ${recipe.active ? "" : "opacity-70"}`}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{recipe.displayName}</span>
      <Badge variant={recipe.active ? "secondary" : "outline"} className="shrink-0">
        {recipe.active ? "Active" : "Off"}
      </Badge>
    </button>
  );
}
