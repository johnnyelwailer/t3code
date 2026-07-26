import type { AtlassianAssignableUser, AtlassianChildIssueType } from "~/t3team/backend/t3team-types";
import { Button } from "~/t3team/components/ui/t3team-button";
import { ChildIssueCreateForm } from "~/t3team/t3team-ChildIssueCreateForm";
import type { ChildIssueCreateDraft } from "~/t3team/t3team-childIssueCreateTypes";

/** Cancel/Create footer around {@link ChildIssueCreateForm} — the one wrapper both call sites use. */
export function ChildIssueCreatePanel({
  parentDisplayId,
  draft,
  saving,
  error,
  className,
  currentUserName,
  searchAssignableUsers,
  listChildIssueTypes,
  onDraftChange,
  onCancel,
  onSubmit,
}: {
  readonly parentDisplayId: string;
  readonly draft: ChildIssueCreateDraft;
  readonly saving: boolean;
  readonly error: string | null;
  readonly className: string;
  readonly currentUserName?: string | undefined;
  readonly searchAssignableUsers: (
    query?: string,
  ) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  readonly listChildIssueTypes?: () => Promise<ReadonlyArray<AtlassianChildIssueType>>;
  readonly onDraftChange: (draft: ChildIssueCreateDraft) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}) {
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ChildIssueCreateForm
        parentDisplayId={parentDisplayId}
        draft={draft}
        saving={saving}
        error={error}
        {...(currentUserName ? { currentUserName } : {})}
        searchAssignableUsers={searchAssignableUsers}
        {...(listChildIssueTypes ? { listChildIssueTypes } : {})}
        onDraftChange={onDraftChange}
      />
      <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-2">
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={saving}>
          Create
        </Button>
      </div>
    </form>
  );
}
