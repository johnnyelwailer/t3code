"use client";

import { useNowMinute } from "~/hooks/useNowMinute";
import { JiraSignInPanel } from "~/t3team/components/t3team-JiraSignInPanel";
import { Button } from "../ui/button";
import { SettingsSection } from "./settingsLayout";
import { JiraConnectionCard } from "./t3team-JiraConnectionCard";
import { useJiraAccountStatuses } from "./t3team-useJiraAccountStatuses";

const ROW_CLASS = "px-4 py-3.5 text-xs text-muted-foreground sm:px-5";

/** The Jira entry of "Connected tools": every stored site with its session and sync state. */
export function JiraConnectionSettings() {
  const { state, reload, disconnect } = useJiraAccountStatuses();
  // useNowMinute yields UTC wall-clock text without a zone suffix; parse it as UTC.
  const nowMs = Date.parse(`${useNowMinute()}Z`);

  return (
    <SettingsSection title="Jira">
      {state.kind === "loading" ? <p className={ROW_CLASS}>Checking the Jira connection…</p> : null}
      {state.kind === "error" ? (
        <div className={`${ROW_CLASS} flex items-center justify-between gap-3`}>
          <p>Could not read the Jira connection.</p>
          <Button size="sm" variant="outline" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : null}
      {state.kind === "ready" && state.accounts.length === 0 ? (
        <div className="px-4 py-3.5 sm:px-5">
          <JiraSignInPanel heading="Jira is not connected." onSignedIn={reload} />
        </div>
      ) : null}
      {state.kind === "ready"
        ? state.accounts.map((account) => (
            <JiraConnectionCard
              key={account.id}
              account={account}
              nowMs={nowMs}
              onSignedIn={reload}
              onDisconnect={() => disconnect(account.id)}
            />
          ))
        : null}
    </SettingsSection>
  );
}
