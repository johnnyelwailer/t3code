import { useMemo } from "react";

import type { IntegrationAccount } from "@t3tools/integrations-core";
import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import { atlassianSiteHost } from "~/t3team/hooks/t3team-createProjectUtils";
import { useT3TeamPackSetupProfiles } from "~/t3team/t3team-packSetupProfiles";
import { CreateProjectDialogReviewDetails } from "~/t3team/t3team-CreateProjectDialogReviewDetails";
import { resolveReviewSetupProfileSummary } from "~/t3team/t3team-createProjectReviewProfile";
import { makeWorkspacePath } from "~/t3team/t3team-mock-adapter";
import { T3TeamProjectSetupConfirmPreviewView } from "~/t3team/t3team-ProjectSetupConfirmPreviewView";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";

/**
 * Last step before creation. Which project this is now lives in the wizard frame's own heading
 * slot (see `ConfirmStepHeading` in `t3team-CreateProjectDialogConfirmStep.tsx`, reused here rather
 * than duplicated), so this step's body covers everything else the earlier steps decided: the site
 * the project comes from, the setup profile that will apply (previously omitted entirely), what it
 * turns on, whether any repositories are linked, and where the workspace will be created on disk.
 */
export function ReviewStep({
  setupProfileId,
  customProfile,
  linkedRepositoryUrls,
  selectedAccount,
  projectTitle,
}: {
  setupProfileId: T3TeamProjectSetupProfileId;
  customProfile?: T3TeamProfile | undefined;
  linkedRepositoryUrls: ReadonlyArray<string>;
  selectedAccount: IntegrationAccount | null;
  projectTitle: string | undefined;
}) {
  const packProfiles = useT3TeamPackSetupProfiles();
  const profileSummary = resolveReviewSetupProfileSummary({
    setupProfileId,
    customProfile,
    packProfiles,
  });
  const workspacePath = useMemo(
    () => makeWorkspacePath(projectTitle ?? "Project"),
    [projectTitle],
  );
  const siteLabel = selectedAccount?.accountUrl
    ? (atlassianSiteHost(selectedAccount.accountUrl) ?? selectedAccount.accountUrl)
    : (selectedAccount?.label ?? "—");

  return (
    <section className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Review the setup below, then add the project.
      </p>
      <dl className="grid gap-y-3 rounded-xl border border-border/65 bg-muted/15 px-3 py-3">
        <CreateProjectDialogReviewDetails
          siteLabel={siteLabel}
          profileSummary={profileSummary}
          linkedRepositoryUrls={linkedRepositoryUrls}
          workspacePath={workspacePath}
        />
        <T3TeamProjectSetupConfirmPreviewView
          profileId={setupProfileId}
          {...(customProfile ? { customProfile } : {})}
        />
      </dl>
    </section>
  );
}
