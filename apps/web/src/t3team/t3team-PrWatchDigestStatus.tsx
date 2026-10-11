/**
 * The digest header's one-line PR-watch count (doc 07 §2.6, decision 2): the kickoff aside that
 * holds the card is collapsed by default, so the header says `👁 12 watched · 2 need you` next
 * to *Jira synced*. Renders nothing while the recipe is off. "Need you" is live from the watch
 * threads, like the card.
 */
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useRecipeRun } from "~/state/t3team-recipeRun";
import { isRunActive } from "~/state/t3team-recipeRun.logic";
import {
  WATCHED_TONE_TEXT_CLASS,
  WatchedPullRequestEye,
} from "~/components/pullRequest/t3team-watchedPullRequestEye";
import { cn } from "~/lib/utils";
import { resolveRunCounts } from "~/t3team/t3team-recipeRunToggleState";

export const PR_WATCH_RECIPE_ID = "pr-watch";

export function PrWatchDigestStatus({
  projectId,
  recipeId = PR_WATCH_RECIPE_ID,
}: {
  projectId: string | undefined;
  recipeId?: string;
}) {
  const environmentId = usePrimaryEnvironmentId();
  const run = useRecipeRun({ environmentId, projectId, recipeId });
  const status = run.home?.workflowRunStatus;
  if (!isRunActive(status) && status?.status !== "failed") return null;
  const counts = resolveRunCounts(run);
  const needsYou = counts["needs-you"];
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="pr-watch-digest-status">
      <WatchedPullRequestEye
        tone={needsYou > 0 ? "needs-you" : "quiet"}
        className="text-muted-foreground"
      />
      <span className="tabular-nums">{counts.watched} watched</span>
      {needsYou > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span className={cn("font-medium tabular-nums", WATCHED_TONE_TEXT_CLASS["needs-you"])}>
            {needsYou} need{needsYou === 1 ? "s" : ""} you
          </span>
        </>
      ) : null}
    </span>
  );
}
