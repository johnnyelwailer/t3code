import { CheckIcon } from "lucide-react";
import { useState } from "react";

import { useProjects } from "~/state/entities";
import { mapBoundProjectIds } from "~/t3team/hooks/t3team-createProjectCatalogRows";
import { useCreateProjectSubmit } from "~/t3team/hooks/t3team-useCreateProjectSubmit";
import type { JiraCatalogState } from "~/t3team/hooks/t3team-useJiraProjectCatalogState";
import { CalmError } from "~/t3team/t3team-CalmError";
import { CreateProjectChooseStep } from "~/t3team/t3team-CreateProjectChooseStep";
import { CreateProjectConnectPanel } from "~/t3team/t3team-CreateProjectConnectPanel";
import { useT3TeamProjectSetupProfile } from "~/t3team/t3team-projectSetupProfile";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { WelcomeContinueButton, WelcomeStepShell } from "./t3team-WelcomeStepShell";

const SUBMIT_SCOPE = "welcome-first-project";

/**
 * Pick the first Jira project. Choosing one creates it right away with the current working
 * style and no repositories (they can be linked later from the project); a project the app
 * already has counts as chosen.
 */
export function WelcomeFirstProjectStep({
  catalog,
  onContinue,
}: {
  readonly catalog: JiraCatalogState;
  readonly onContinue: () => void;
}) {
  const appProjects = useProjects();
  const boundProjectIds = mapBoundProjectIds(appProjects);
  const setupProfileId = useT3TeamProjectSetupProfile();
  const { state, submit } = useCreateProjectSubmit(SUBMIT_SCOPE);
  const [chosenTitle, setChosenTitle] = useState<string | null>(null);
  const hasProject = chosenTitle !== null || boundProjectIds.size > 0;

  return (
    <WelcomeStepShell
      title="Set up your first project"
      description="Pick the Jira project you work in. Its tickets fill My Work."
      actions={
        hasProject ? (
          <WelcomeContinueButton onClick={onContinue} />
        ) : (
          <Button variant="ghost" disabled={state.kind === "creating"} onClick={onContinue}>
            Skip for now
          </Button>
        )
      }
    >
      {state.kind === "error" ? (
        <CalmError compact error={state.error} action="creating the project" />
      ) : null}
      {state.kind === "creating" && chosenTitle === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Creating the project…
        </div>
      ) : chosenTitle !== null ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-4 text-sm">
          <CheckIcon className="size-4 shrink-0 text-success" />
          <span className="min-w-0 truncate">{chosenTitle} is ready.</span>
        </div>
      ) : (
        <CreateProjectChooseStep
          catalogState={catalog}
          boundProjectIds={boundProjectIds}
          connectPanel={<CreateProjectConnectPanel refreshCatalog={catalog.refresh} />}
          onChoose={({ entry, existingProjectId }) => {
            if (existingProjectId !== null) {
              setChosenTitle(entry.title);
              return;
            }
            void submit({ entry, linkedRepositoryUrls: [], setupProfileId }).then((project) => {
              if (project) setChosenTitle(project.title);
            });
          }}
        />
      )}
    </WelcomeStepShell>
  );
}
