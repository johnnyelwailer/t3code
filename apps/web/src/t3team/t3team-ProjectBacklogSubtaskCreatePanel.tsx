import { Button } from "~/t3team/components/ui/t3team-button";
import {
  ProjectBacklogSubtaskCreateForm,
  type ProjectBacklogSubtaskCreateDraft,
} from "~/t3team/t3team-ProjectBacklogSubtaskCreateForm";
import type { ProjectTicket } from "~/t3team/t3team-types";

type ProjectBacklogSubtaskCreatePanelProps = {
  ticket: ProjectTicket;
  draft: ProjectBacklogSubtaskCreateDraft;
  saving: boolean;
  error: string | null;
  className: string;
  onDraftChange: (draft: ProjectBacklogSubtaskCreateDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function ProjectBacklogSubtaskCreatePanel({
  ticket,
  draft,
  saving,
  error,
  className,
  onDraftChange,
  onCancel,
  onSubmit,
}: ProjectBacklogSubtaskCreatePanelProps) {
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ProjectBacklogSubtaskCreateForm
        ticket={ticket}
        draft={draft}
        saving={saving}
        error={error}
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
