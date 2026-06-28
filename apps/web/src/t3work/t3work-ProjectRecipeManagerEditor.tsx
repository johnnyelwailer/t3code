import { MessageSquarePlus, Power, Trash2 } from "lucide-react";
import type { ManagedProjectRecipe } from "@t3tools/project-recipes";

import { Badge } from "~/t3work/components/ui/t3work-badge";
import { Button } from "~/t3work/components/ui/t3work-button";
import { Input } from "~/t3work/components/ui/t3work-input";
import { Textarea } from "~/t3work/components/ui/t3work-textarea";

export type ProjectRecipeManagerDraft = Pick<
  ManagedProjectRecipe,
  "displayName" | "shortDescription" | "prompt"
>;

export function toProjectRecipeManagerDraft(
  recipe: ManagedProjectRecipe,
): ProjectRecipeManagerDraft {
  return {
    displayName: recipe.displayName,
    shortDescription: recipe.shortDescription,
    prompt: recipe.prompt ?? "",
  };
}

export function ProjectRecipeManagerEditor({
  recipe,
  draft,
  busy,
  onDraftChange,
  onSave,
  onEditWithChat,
  onToggleActive,
  onDelete,
}: {
  readonly recipe: ManagedProjectRecipe | null;
  readonly draft: ProjectRecipeManagerDraft | null;
  readonly busy: boolean;
  readonly onDraftChange: (draft: ProjectRecipeManagerDraft) => void;
  readonly onSave: () => void;
  readonly onEditWithChat: () => void;
  readonly onToggleActive: () => void;
  readonly onDelete: () => void;
}) {
  if (!recipe || !draft) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Select a recipe from the list to view and edit its configuration.
        </p>
      </div>
    );
  }

  const sourceLabel = recipe.sourceKind === "recipe-json" ? "recipe.json" : "recipe.ts";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{recipe.displayName}</h3>
            <Badge variant={recipe.active ? "secondary" : "outline"}>
              {recipe.active ? "Active" : "Deactivated"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {sourceLabel}
            {recipe.topic ? ` · ${recipe.topic}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="outline" onClick={onEditWithChat}>
            <MessageSquarePlus className="size-3.5" />
            Edit with chat
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onToggleActive}
            disabled={busy}
            aria-label={recipe.active ? "Deactivate recipe" : "Activate recipe"}
          >
            <Power className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy || !recipe.deletable}
            aria-label="Delete recipe"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Display name</label>
            <Input
              value={draft.displayName}
              disabled={!recipe.editable}
              aria-label="Recipe name"
              onChange={(event) => onDraftChange({ ...draft, displayName: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Short description</label>
            <Textarea
              className="min-h-20"
              value={draft.shortDescription}
              disabled={!recipe.editable}
              aria-label="Recipe description"
              onChange={(event) =>
                onDraftChange({ ...draft, shortDescription: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Prompt</label>
            <Textarea
              className="min-h-56 font-mono text-xs leading-relaxed"
              value={draft.prompt}
              disabled={!recipe.editable}
              placeholder="Typed recipe modules are edited in source."
              aria-label="Recipe prompt"
              onChange={(event) => onDraftChange({ ...draft, prompt: event.target.value })}
            />
          </div>
          <Button className="self-start" onClick={onSave} disabled={!recipe.editable || busy}>
            Save recipe
          </Button>
        </div>
      </div>
    </div>
  );
}
