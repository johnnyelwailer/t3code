import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import { T3TeamProjectSetupConfirmPreviewView } from "~/t3team/t3team-ProjectSetupConfirmPreviewView";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";

/**
 * Last step before creation. Which project this is now lives in the wizard frame's own heading
 * slot (see `ConfirmStepHeading` in `t3team-CreateProjectDialogConfirmStep.tsx`, reused here rather
 * than duplicated), so this step's body has exactly one job: state the consequence of the profile
 * and repository choices made on the two steps before it, in one compact line, ahead of the
 * footer's single "Add project" action.
 */
export function ReviewStep({
  setupProfileId,
  customProfile,
  linkedRepositoryUrls,
}: {
  setupProfileId: T3TeamProjectSetupProfileId;
  customProfile?: T3TeamProfile | undefined;
  linkedRepositoryUrls: ReadonlyArray<string>;
}) {
  return (
    <section className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Review the setup below, then add the project.
      </p>
      <T3TeamProjectSetupConfirmPreviewView
        profileId={setupProfileId}
        repositoryCount={linkedRepositoryUrls.length}
        {...(customProfile ? { customProfile } : {})}
      />
    </section>
  );
}
