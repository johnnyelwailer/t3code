import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import { cn } from "~/lib/utils";
import { buildT3TeamProjectSetupConfirmPreview } from "~/t3team/t3team-projectSetupConfirmPreview";

/**
 * What the chosen profile actually turns on.
 *
 * Previously this was a tall panel: a heading, an explanatory sentence, a chip row, three expanded
 * recipe cards and a closing note about managed-file hashes — enough to push the profile cards and
 * the repository section out of a fixed-height dialog. It is a *consequence* of the choice above it,
 * not a choice of its own, so it now states the consequence in one line and keeps the detail one
 * click away.
 *
 * The two prose paragraphs are gone. "ranked from profile preferences — not profile id alone"
 * described our implementation, and the mutation-safety note answered a question nobody is asking
 * while picking a working style.
 */
export function T3TeamProjectSetupConfirmPreviewView({
  profileId,
  customProfile,
}: {
  readonly profileId: string;
  readonly customProfile?: T3TeamProfile;
}) {
  const [showRecipes, setShowRecipes] = useState(false);

  const preview = useMemo(
    () =>
      buildT3TeamProjectSetupConfirmPreview({
        profileId,
        ...(customProfile ? { customProfile } : {}),
      }),
    [profileId, customProfile],
  );

  return (
    <div className="space-y-2 rounded-xl border border-border/65 bg-muted/15 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Turns on</span>
        {preview.skillPacks.map((pack) => (
          <span
            key={pack.id}
            className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-xs font-medium"
          >
            {pack.title}
          </span>
        ))}
      </div>

      {preview.topRecipes.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setShowRecipes((current) => !current)}
            aria-expanded={showRecipes}
            className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform", showRecipes && "rotate-90")}
              aria-hidden="true"
            />
            {preview.topRecipes.length} starter recipes
          </button>

          {showRecipes ? (
            <ul className="space-y-1 pl-4.5">
              {preview.topRecipes.map((recipe) => (
                <li key={recipe.id} className="text-xs leading-5">
                  <span className="font-medium text-foreground">{recipe.title}</span>
                  <span className="text-muted-foreground"> — {recipe.reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
