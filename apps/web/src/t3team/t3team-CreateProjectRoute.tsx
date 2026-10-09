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
import { CreateProjectPage } from "~/t3team/t3team-CreateProjectPage";
import { CreateProjectSetupFooter } from "~/t3team/t3team-CreateProjectSetupFooter";
import { CreateProjectSetupStep } from "~/t3team/t3team-CreateProjectSetupStep";

/** Repository discovery only runs while the set-up screen is on, so it lives in its own component. */
function SetupScreen({
  flow,
  entry,
}: {
  flow: CreateProjectFlow;
  entry: NonNullable<CreateProjectFlow["entry"]>;
}) {
  const { selection } = flow;
  const discovery = useGitHubRepositoryDiscovery({
    enabled: true,
    projectKey: entry.key,
    projectTitle: entry.title,
    linkedRepositoryUrls: selection.linkedRepositoryUrls,
  });

  return (
    <CreateProjectSetupStep
      discovery={discovery}
      linkedRepositoryUrls={selection.linkedRepositoryUrls}
      onToggleRepository={selection.toggleRepository}
      onLinkRepositories={selection.linkRepositories}
    />
  );
}

/**
 * `/t3team/new`: the add-a-Jira-project page, as a route. Which screen shows is the URL
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
  const dismissible = !flow.creating;

  return (
    <CreateProjectPage
      entry={
        shownEntry
          ? {
              title: shownEntry.title,
              key: shownEntry.key,
              iconUrl: shownEntry.iconUrl,
              siteHost: spansMultipleSites(catalogState.catalog) ? shownEntry.siteHost : null,
            }
          : null
      }
      onClose={navigation.close}
      dismissible={dismissible}
      footer={
        shownEntry ? (
          <CreateProjectSetupFooter
            projectTitle={shownEntry.title}
            creating={flow.creating}
            error={flow.submitState.kind === "error" ? flow.submitState.error : null}
            onBack={navigation.backToChoose}
            onCreate={() => void flow.create()}
          />
        ) : null
      }
    >
      {shownEntry ? (
        <SetupScreen flow={flow} entry={shownEntry} />
      ) : flow.resolvingProject ? (
        <div className="space-y-3 pt-4">
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
    </CreateProjectPage>
  );
}
