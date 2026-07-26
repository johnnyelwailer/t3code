import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { Input } from "~/t3team/components/ui/t3team-input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "~/components/ui/input-group";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type ProjectBacklogSubtaskCreateDraft = {
  summary: string;
  estimateHours: string;
};

export function ProjectBacklogSubtaskCreateForm({
  ticket,
  draft,
  saving,
  error,
  onDraftChange,
}: {
  ticket: ProjectTicket;
  draft: ProjectBacklogSubtaskCreateDraft;
  saving: boolean;
  error?: string | null;
  onDraftChange: (draft: ProjectBacklogSubtaskCreateDraft) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5.25rem]">
        <label className="min-w-0">
          <span className="sr-only">Subtask title</span>
          <Input
            aria-label={`Subtask title for ${ticket.ref.displayId}`}
            autoFocus
            disabled={saving}
            size="sm"
            className="border-border/80 bg-background text-[12px]"
            value={draft.summary}
            onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })}
            placeholder={`New subtask under ${ticket.ref.displayId}`}
          />
        </label>

        <label className="min-w-0">
          <span className="sr-only">Estimated hours</span>
          <InputGroup className="rounded-md border-border/80">
            <InputGroupInput
              aria-label={`Estimated hours for ${ticket.ref.displayId}`}
              disabled={saving}
              inputMode="decimal"
              size="sm"
              className="[&_[data-slot=input]]:bg-transparent [&_[data-slot=input]]:px-2 [&_[data-slot=input]]:text-right [&_[data-slot=input]]:text-[12px] [&_[data-slot=input]]:tabular-nums"
              value={draft.estimateHours}
              onChange={(event) => onDraftChange({ ...draft, estimateHours: event.target.value })}
              placeholder="2.5"
            />
            <InputGroupAddon align="inline-end" className="pe-2">
              <InputGroupText className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                h
              </InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <span>{`Under ${ticket.ref.displayId}`}</span>
        <span>{`${ticket.subtaskCount ?? 0} existing subtasks`}</span>
      </div>

      {error ? (
        <T3TeamErrorState error={error} action="creating the subtask" variant="inline" />
      ) : null}
    </div>
  );
}
