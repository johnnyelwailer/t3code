import { CheckIcon } from "lucide-react";

import type { JiraCatalogState } from "~/t3team/hooks/t3team-useJiraProjectCatalogState";
import { CreateProjectConnectPanel } from "~/t3team/t3team-CreateProjectConnectPanel";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { WelcomeContinueButton, WelcomeStepShell } from "./t3team-WelcomeStepShell";

/** Sign in to Jira (OAuth or API token, the add-project connect panel), or skip it for now. */
export function WelcomeJiraStep({
  catalog,
  onContinue,
}: {
  readonly catalog: JiraCatalogState;
  readonly onContinue: () => void;
}) {
  const connected = catalog.connected === true;
  return (
    <WelcomeStepShell
      title="Connect Jira"
      description="My Work shows the tickets assigned to you in a connected Jira site."
      actions={
        connected ? (
          <WelcomeContinueButton onClick={onContinue} />
        ) : (
          <Button variant="ghost" onClick={onContinue}>
            Skip for now
          </Button>
        )
      }
    >
      {connected ? (
        <JiraConnectedSites catalog={catalog} />
      ) : catalog.connected === null && catalog.loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Checking for a Jira connection…
        </div>
      ) : (
        <CreateProjectConnectPanel refreshCatalog={catalog.refresh} />
      )}
    </WelcomeStepShell>
  );
}

function JiraConnectedSites({ catalog }: { readonly catalog: JiraCatalogState }) {
  const sites = [...new Set(catalog.catalog.map((entry) => entry.siteHost ?? "Jira"))];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-4 text-sm">
      <CheckIcon className="size-4 shrink-0 text-success" />
      <span className="min-w-0 truncate">
        {sites.length > 0 ? `Connected to ${sites.join(", ")}` : "Jira is connected"}
      </span>
    </div>
  );
}
