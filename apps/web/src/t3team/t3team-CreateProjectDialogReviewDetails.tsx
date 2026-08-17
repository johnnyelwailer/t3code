/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import { parseRepositoryLabel } from "~/t3team/components/t3team-linkedRepositories";
import type { ReviewSetupProfileSummary } from "~/t3team/t3team-createProjectReviewProfile";
import {
  WorkItemPropertyChips,
  WorkItemPropertyRow,
} from "~/t3team/workitem/t3team-WorkItemPropertyRow";

/**
 * The rows the old one-line "Turns on" summary never covered: which site the project comes from,
 * which setup profile is applied (and what it means), whether any repositories are linked, and
 * where the project's files will actually land. Reuses `WorkItemPropertyRow` /
 * `WorkItemPropertyChips` — the same labelled-row primitive the work-item detail rail already
 * uses — instead of inventing new card/row styling for this one screen.
 *
 * Returns bare rows (no `<dl>` of its own) so the caller can lay this out next to the
 * skill-packs/recipes rows from `T3TeamProjectSetupConfirmPreviewView` inside one shared list,
 * exactly like `WorkItemProperties.tsx` composes its own rows.
 */
export function CreateProjectDialogReviewDetails({
  siteLabel,
  profileSummary,
  linkedRepositoryUrls,
  workspacePath,
}: {
  readonly siteLabel: string;
  readonly profileSummary: ReviewSetupProfileSummary;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  readonly workspacePath: string;
}) {
  const repositoryCount = linkedRepositoryUrls.length;

  return (
    <>
      <WorkItemPropertyRow label="Jira site" value={siteLabel} />

      <WorkItemPropertyRow label="Setup profile" value={profileSummary.title}>
        <div className="space-y-0.5">
          <div className="font-medium text-foreground">{profileSummary.title}</div>
          {profileSummary.description ? (
            <div className="text-muted-foreground">{profileSummary.description}</div>
          ) : null}
        </div>
      </WorkItemPropertyRow>

      <WorkItemPropertyRow
        label="Repositories"
        value={repositoryCount > 0 ? `${repositoryCount} linked` : "None linked"}
      >
        {repositoryCount > 0 ? (
          <WorkItemPropertyChips values={linkedRepositoryUrls.map(parseRepositoryLabel)} />
        ) : (
          <span className="text-muted-foreground">
            None linked — optional, add or change this later from the project.
          </span>
        )}
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Workspace" value={workspacePath}>
        <span className="block truncate" title={workspacePath}>
          {workspacePath}
        </span>
      </WorkItemPropertyRow>
    </>
  );
}
