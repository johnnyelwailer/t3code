import { useRef } from "react";

import type { ProjectShellProject } from "@t3tools/project-context";

import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import { useGitHubRepositoryDiscovery } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";
import {
  useCreateProjectFlow,
  type CreateProjectFlow,
} from "~/t3team/hooks/t3team-useCreateProjectFlow";
import { spansMultipleSites } from "~/t3team/hooks/t3team-createProjectCatalogRows";
import { CreateProjectChooseStep } from "~/t3team/t3team-CreateProjectChooseStep";
import { CreateProjectConnectPanel } from "~/t3team/t3team-CreateProjectConnectPanel";
import { JiraProjectDialogShell } from "~/t3team/t3team-JiraProjectDialogShell";
import { CreateProjectSetupStep } from "~/t3team/t3team-CreateProjectSetupStep";

/** Repository discovery only runs while the set-up screen is on, so it lives in its own component. */
function SetupScreen({
  flow,
  entry,
}: {
  flow: CreateProjectFlow;
  entry: NonNullable<CreateProjectFlow["entry"]>;
}) {
  const { selection, profile } = flow;
  const discovery = useGitHubRepositoryDiscovery({
    enabled: true,
    projectKey: entry.key,
    projectTitle: entry.title,
    linkedRepositoryUrls: selection.linkedRepositoryUrls,
  });

  return (
    <CreateProjectSetupStep
      entry={{
        ...entry,
        siteHost: spansMultipleSites(flow.catalogState.catalog) ? entry.siteHost : null,
      }}
      discovery={discovery}
      linkedRepositoryUrls={selection.linkedRepositoryUrls}
      onToggleRepository={selection.toggleRepository}
      onLinkRepositories={selection.linkRepositories}
      profileId={profile.setupProfileId}
      customProfile={profile.customProfile}
      packProfiles={profile.packProfiles}
      onProfileChange={profile.onProfileChange}
      onCustomProfileChange={profile.onCustomProfileChange}
      submitState={flow.submitState}
      onBack={flow.navigation.backToChoose}
      onCreate={() => void flow.create()}
    />
  );
}

/**
 * `/t3team/new`: the add-a-Jira-project dialog, as a route. Which screen shows is the URL
 * (`?project=` set → set up, otherwise choose), so Back, reload and deep links all work.
 */
export function CreateProjectRoute({
  onCreated,
}: {
  onCreated: (project: ProjectShellProject) => void;
}) {
  const flow = useCreateProjectFlow(onCreated);
  const { entry, catalogState, navigation } = flow;
  // While a create runs the set-up screen stays put, even if the URL moves under it (browser Back):
  // the create is not cancellable, and a different screen would hide what is happening.
  const lastEntryRef = useRef(entry);
  if (entry) lastEntryRef.current = entry;
  const shownEntry = entry ?? (flow.creating ? lastEntryRef.current : null);

  return (
    <JiraProjectDialogShell onClose={navigation.close} dismissible={!flow.creating}>
      {shownEntry ? (
        <SetupScreen flow={flow} entry={shownEntry} />
      ) : flow.resolvingProject || flow.openingExisting ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <CreateProjectChooseStep
          catalogState={catalogState}
          boundProjectIds={flow.boundProjectIds}
          notice={
            flow.projectMissing ? "That project is no longer available — pick another." : undefined
          }
          connectPanel={<CreateProjectConnectPanel refreshCatalog={catalogState.refresh} />}
          onChoose={({ entry: chosen, existingProjectId }) =>
            existingProjectId === null
              ? navigation.chooseProject(chosen)
              : navigation.openProject(existingProjectId)
          }
        />
      )}
    </JiraProjectDialogShell>
  );
}
