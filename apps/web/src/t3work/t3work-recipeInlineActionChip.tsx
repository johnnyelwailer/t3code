import { startTransition } from "react";

import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { useRunT3workInlineRecipeLaunch } from "~/t3work/t3work-inlineRecipeLaunch";

export function InlineActionChip({
  recipeId,
  label,
}: {
  readonly recipeId: string;
  readonly label: string;
}) {
  const runInlineRecipeLaunch = useRunT3workInlineRecipeLaunch();

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-colors",
        "hover:border-border hover:bg-accent/40 hover:text-foreground",
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();

        startTransition(() => {
          void runInlineRecipeLaunch(recipeId)
            .then((outcome) => {
              if (!outcome) {
                toastManager.add({
                  type: "warning",
                  title: "Action unavailable",
                  description: "This recipe action is not available in the current view.",
                });
                return;
              }
              if (!outcome.applied) {
                toastManager.add({
                  type: "info",
                  title: "No change applied",
                  description:
                    outcome.promptText ?? "The current view is already filtered that way.",
                });
                return;
              }

              toastManager.add({
                type: "success",
                title: label,
                description: outcome.promptText ?? "Applied the recipe action inline.",
              });
            })
            .catch(() => {
              toastManager.add({
                type: "warning",
                title: "Action unavailable",
                description: "This recipe action could not be applied right now.",
              });
            });
        });
      }}
    >
      {label}
    </button>
  );
}
