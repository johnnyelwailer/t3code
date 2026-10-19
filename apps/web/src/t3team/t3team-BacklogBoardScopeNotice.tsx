import { useState } from "react";

import { JiraNoticeCard } from "~/t3team/components/t3team-JiraNoticeCard";
import { JiraSignInPanel } from "~/t3team/components/t3team-JiraSignInPanel";

/**
 * Shown while the Jira connection was granted before the backlog asked for the Jira Software
 * scopes. The backlog still works from issue data, but it cannot read the board's own filter,
 * sprints or quick filters, so it shows the whole project. Signing in again (the same flow as
 * onboarding, via `JiraSignInPanel`) grants them; `onReconnected` then reloads the backlog.
 */
export function BacklogBoardScopeNotice({ onReconnected }: { onReconnected: () => void }) {
  const [signingIn, setSigningIn] = useState(false);

  if (signingIn) {
    return (
      <JiraSignInPanel
        heading="Sign in to Jira again to give Nexi Work access to your boards."
        onSignedIn={() => {
          setSigningIn(false);
          onReconnected();
        }}
      />
    );
  }

  return (
    <JiraNoticeCard
      lead="Showing the whole Jira project, not your board."
      detail="Reconnect Jira to use the board's filter, sprints and quick filters."
      actionLabel="Reconnect Jira"
      onAction={() => setSigningIn(true)}
    />
  );
}
