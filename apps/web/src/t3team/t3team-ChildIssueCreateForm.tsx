import type { AtlassianAssignableUser, AtlassianChildIssueType } from "~/t3team/backend/t3team-types";
import { Input } from "~/t3team/components/ui/t3team-input";
import { Textarea } from "~/t3team/components/ui/t3team-textarea";
import { ChildIssueAssigneeField } from "~/t3team/t3team-ChildIssueAssigneeField";
import type { ChildIssueCreateDraft } from "~/t3team/t3team-childIssueCreateTypes";
import { ChildIssueEstimateField } from "~/t3team/t3team-ChildIssueEstimateField";
import { ChildIssueTypeField } from "~/t3team/t3team-ChildIssueTypeField";
import { useChildIssueTypeOptions } from "~/t3team/workitem/t3team-useChildIssueTypeOptions";

/**
 * The one child-issue create form — issue type, summary, assignee, estimate, description — used by
 * both the backlog row's "Add subtask" popover and the work-item detail's Children section. Neither
 * surface gets a title-only clone of the other's form anymore.
 */
export function ChildIssueCreateForm({
  parentDisplayId,
  draft,
  onDraftChange,
  saving,
  error,
  currentUserName,
  searchAssignableUsers,
  listChildIssueTypes,
}: {
  readonly parentDisplayId: string;
  readonly draft: ChildIssueCreateDraft;
  readonly onDraftChange: (draft: ChildIssueCreateDraft) => void;
  readonly saving: boolean;
  readonly error?: string | null;
  readonly currentUserName?: string | undefined;
  readonly searchAssignableUsers: (
    query?: string,
  ) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  /** Absent where a caller hasn't wired the createmeta lookup yet — the issue-type field then shows
   * its resolved default disabled instead of a picker. */
  readonly listChildIssueTypes?: () => Promise<ReadonlyArray<AtlassianChildIssueType>>;
}) {
  const typeOptions = useChildIssueTypeOptions({
    enabled: Boolean(listChildIssueTypes),
    fetch: listChildIssueTypes ?? (() => Promise.resolve([])),
  });

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        {/* Fixed width: the type field's `Select` renders `w-full`, which would otherwise fight
            the title input below for space in this flex row. */}
        <div className="w-32 shrink-0">
          <ChildIssueTypeField
            options={typeOptions.options}
            loading={typeOptions.loading}
            reachable={Boolean(listChildIssueTypes)}
            value={draft.issueTypeId}
            onChange={(issueTypeId) => onDraftChange({ ...draft, issueTypeId })}
            disabled={saving}
          />
        </div>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Child issue title</span>
          <Input
            aria-label={`Child issue title for ${parentDisplayId}`}
            autoFocus
            disabled={saving}
            size="sm"
            className="border-border/80 bg-background text-[12px]"
            value={draft.summary}
            onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })}
            placeholder={`New child issue under ${parentDisplayId}`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ChildIssueAssigneeField
          search={searchAssignableUsers}
          {...(currentUserName ? { currentUserName } : {})}
          assignee={draft.assignee}
          onChange={(assignee) => onDraftChange({ ...draft, assignee })}
          disabled={saving}
        />
        <ChildIssueEstimateField
          hoursText={draft.estimateHours}
          onChange={(estimateHours) => onDraftChange({ ...draft, estimateHours })}
          disabled={saving}
        />
      </div>

      <label className="block">
        <span className="sr-only">Description</span>
        <Textarea
          rows={2}
          disabled={saving}
          className="text-[12px]"
          value={draft.description}
          onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
          placeholder="Add a description (optional)"
        />
      </label>

      {/* Already a plain sentence the caller composed (validation text or a caught exception's
          message) — routing it through `T3TeamErrorState`/`toUserFacingError` would reclassify it
          and could silently replace it with the generic fallback headline instead of showing it. */}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
