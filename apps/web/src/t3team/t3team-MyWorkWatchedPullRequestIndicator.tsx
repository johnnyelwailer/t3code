import type { ComponentProps } from "react";

import { WatchedPullRequestIndicator } from "~/components/pullRequest/t3team-WatchedPullRequestIndicator";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

/** The watched-PR indicator on My Work rows, behind `MYWORK_PR_WATCH_SURFACES`. The thread
 * sidebar and the pull request panels keep the indicator either way. */
export function MyWorkWatchedPullRequestIndicator(
  props: ComponentProps<typeof WatchedPullRequestIndicator>,
) {
  return useFeatureFlag("MYWORK_PR_WATCH_SURFACES") ? (
    <WatchedPullRequestIndicator {...props} />
  ) : null;
}
