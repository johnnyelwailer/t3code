/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import { Card, CardContent } from "~/t3work/components/ui/t3work-card";
import { Button } from "~/t3work/components/ui/t3work-button";
import { Badge } from "~/t3work/components/ui/t3work-badge";
import {
  MessageSquare,
  Search,
  ClipboardCheck,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export interface Recipe {
  id: string;
  title: string;
  description: string;
  icon: "explain" | "review" | "test" | "risk" | "comment";
  outputType: "chat" | "artifact" | "mutation";
}

const RECIPE_ICONS = {
  explain: MessageSquare,
  review: Search,
  test: ClipboardCheck,
  risk: AlertTriangle,
  comment: MessageSquare,
};

const RECIPE_BADGES: Record<Recipe["outputType"], string> = {
  chat: "Chat",
  artifact: "Artifact",
  mutation: "Draft comment",
};

interface RecipeLauncherProps {
  recipes: Recipe[];
  onLaunch: (recipe: Recipe) => void;
}

export function RecipeLauncher({ recipes, onLaunch }: RecipeLauncherProps) {
  return (
    <div className="space-y-2">
      {recipes.map((recipe) => {
        const Icon = RECIPE_ICONS[recipe.icon];
        return (
          <Card key={recipe.id} className="hover:bg-accent/50 transition-colors">
            <CardContent className="p-3">
              <button
                type="button"
                onClick={() => onLaunch(recipe)}
                className="flex w-full items-start gap-3 text-left"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{recipe.title}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      {RECIPE_BADGES[recipe.outputType]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{recipe.description}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground mt-1" />
              </button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function RecipeLauncherCompact({ recipes, onLaunch }: RecipeLauncherProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {recipes.map((recipe) => {
        const Icon = RECIPE_ICONS[recipe.icon];
        return (
          <button
            key={recipe.id}
            type="button"
            onClick={() => onLaunch(recipe)}
            className="flex min-h-10 items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <span className="flex items-center gap-2 truncate">
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{recipe.title}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}
