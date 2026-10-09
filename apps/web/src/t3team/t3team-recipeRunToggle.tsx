/**
 * `RunToggle`: the MDX-kit card body for a long-running recipe (doc 07 §2, N1). A Switch starts
 * and stops the recipe's workflow run in the open project, a pencil opens its config file, and
 * one line says what the run is doing. Generic: it reads the recipe from the action-view
 * context and the run from the thread facts; nothing here is PR-watch specific except the
 * summary fact's field names, which the pack writes.
 */
import { PencilIcon } from "lucide-react";
import { useState } from "react";

import { WatchedPullRequestEye } from "~/components/pullRequest/t3team-watchedPullRequestEye";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { useNowMinute } from "~/hooks/useNowMinute";
import { useServerConfigs } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useRecipeRun } from "~/state/t3team-recipeRun";
import { useRecipeActionViewRecipe } from "~/t3team/t3team-recipeActionViewContext";
import { useRecipeRunToggleActions } from "~/t3team/t3team-recipeRunToggleActions";
import { RecipeRunToggleCountLine } from "~/t3team/t3team-recipeRunToggleCountLine";
import { resolveRunToggleState, type RunToggleDotTone } from "~/t3team/t3team-recipeRunToggleState";
import { RecipeRunToggleStopDialog } from "~/t3team/t3team-recipeRunToggleStopDialog";
import { RecipeRunToggleWarnings } from "~/t3team/t3team-recipeRunToggleWarnings";

const DOT_CLASS: Record<RunToggleDotTone, string> = {
  muted: "bg-muted-foreground/40",
  sky: "bg-sky-500 dark:bg-sky-300/80",
  indigo: "bg-indigo-500 dark:bg-indigo-300/90",
  amber: "bg-amber-500 dark:bg-amber-300/90",
  emerald: "bg-emerald-500 dark:bg-emerald-300/90",
  red: "bg-destructive",
};

export function resolveRecipeConfigPath(input: {
  readonly workspaceRoot: string | undefined;
  readonly nexiStateDir: boolean | undefined;
  readonly recipeId: string;
  readonly configFile?: string | undefined;
}): string | null {
  if (!input.workspaceRoot) return null;
  const relative =
    input.configFile ??
    `${input.nexiStateDir === false ? ".t3team" : ".nexi"}/recipes/${input.recipeId}.config.ts`;
  return `${input.workspaceRoot.replace(/\/$/, "")}/${relative}`;
}

export function RunToggle(props: {
  readonly title: string;
  /** Defaults to the recipe this card renders for. */
  readonly recipeId?: string;
  /** The subline while off; doc 07 decision 4 wording for PR watch. */
  readonly offDescription?: string;
  /** Workspace-relative config file; defaults to `<state dir>/recipes/<recipeId>.config.ts`. */
  readonly configFile?: string;
}) {
  const recipe = useRecipeActionViewRecipe();
  const environmentId = usePrimaryEnvironmentId();
  const serverConfig = useServerConfigs().get(environmentId!);
  const recipeId = props.recipeId ?? recipe?.id ?? "";
  const project = recipe?.actionView?.context.project;
  const run = useRecipeRun({ environmentId, projectId: project?.id, recipeId });
  const configPath = resolveRecipeConfigPath({
    workspaceRoot: project?.workspaceRoot,
    nexiStateDir: serverConfig?.nexiStateDir,
    recipeId,
    configFile: props.configFile,
  });
  const actions = useRecipeRunToggleActions({ recipe, environmentId, run, configPath });
  const [confirmStop, setConfirmStop] = useState(false);
  const nowMinute = useNowMinute();
  const state = resolveRunToggleState({
    run,
    pending: actions.pending,
    offDescription: props.offDescription ?? "runs until you switch it off",
    nowMs: Date.parse(nowMinute),
  });
  const eyeTone =
    state.dot === "indigo" ? "needs-you" : state.dot === "amber" ? "attention" : "quiet";

  return (
    <div className="min-w-0 space-y-1.5" data-testid="run-toggle" data-state={state.kind}>
      {/* The item kebab sits absolute at the card's top-right (t3team-sidecarSectionMenu); the
          head row keeps that width free, so the Switch and the kebab never overlap. */}
      <div className="flex min-w-0 items-center gap-2 pr-9">
        <WatchedPullRequestEye
          tone={eyeTone}
          size="md"
          dotClassName={cn(DOT_CLASS[state.dot], state.pulse && "motion-safe:animate-status-pulse")}
          className="text-muted-foreground/70"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
          {props.title}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost-muted"
                size="icon-xs"
                aria-label="Open config"
                disabled={configPath === null}
                onClick={(event) => {
                  event.stopPropagation();
                  void actions.openConfig();
                }}
              />
            }
          >
            <PencilIcon className="size-3" />
          </TooltipTrigger>
          <TooltipPopup side="top">
            {configPath ? `Open ${configPath}` : "No workspace"}
          </TooltipPopup>
        </Tooltip>
        <Switch
          size="sm"
          checked={state.checked}
          disabled={state.busy}
          aria-label={state.checked ? `Switch ${props.title} off` : `Switch ${props.title} on`}
          onCheckedChange={(checked) => {
            if (checked) void actions.start();
            else setConfirmStop(true);
          }}
        />
      </div>
      <div className="min-w-0 space-y-1.5 pl-7">
        <RecipeRunToggleCountLine
          parts={state.line}
          watchers={run.watchThreads}
          onRetry={state.kind === "failed" ? () => void actions.retry() : undefined}
        />
        <RecipeRunToggleWarnings
          warnings={state.warnings}
          onOpenConfig={() => void actions.openConfig()}
        />
      </div>
      <RecipeRunToggleStopDialog
        open={confirmStop}
        watched={state.counts.watched}
        onOpenChange={setConfirmStop}
        onConfirm={() => void actions.stop()}
      />
    </div>
  );
}
