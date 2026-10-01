import { useState } from "react";
import { Info } from "lucide-react";

import { JiraSignInPanel } from "~/t3team/components/t3team-JiraSignInPanel";
import { Button } from "~/t3team/components/ui/t3team-button";
import { T3SurfaceCard } from "~/t3team/components/ui/t3team-surface";

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
    <T3SurfaceCard role="status" tone="muted">
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 p-2.5">
        <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs leading-5 text-foreground">
          <span className="font-medium">Showing the whole Jira project, not your board.</span>{" "}
          <span className="text-muted-foreground">
            Reconnect Jira to use the board&apos;s filter, sprints and quick filters.
          </span>
        </p>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="shrink-0"
          onClick={() => setSigningIn(true)}
        >
          Reconnect Jira
        </Button>
      </div>
    </T3SurfaceCard>
  );
}
