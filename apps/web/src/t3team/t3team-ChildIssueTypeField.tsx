import type { AtlassianChildIssueType } from "~/t3team/backend/t3team-types";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/t3team/components/ui/t3team-select";

/**
 * The child issue type, sourced only from Jira's own createmeta-derived `getChildIssueTypes` — never
 * a hardcoded list. Most projects expose exactly one subtask-shaped type, so the common case is a
 * disabled label naming the resolved default rather than a picker with nothing to pick between;
 * projects with more than one subtask type get a real `Select`.
 */
export function ChildIssueTypeField({
  options,
  loading,
  reachable,
  value,
  onChange,
  disabled,
}: {
  readonly options: ReadonlyArray<AtlassianChildIssueType>;
  readonly loading: boolean;
  /** False when the caller has no `onListChildIssueTypes` wired up at all (not merely empty). */
  readonly reachable: boolean;
  readonly value: string | null;
  readonly onChange: (issueTypeId: string) => void;
  readonly disabled?: boolean;
}) {
  const selected = options.find((option) => option.id === value) ?? options[0];

  if (!reachable || options.length <= 1) {
    const label = loading ? "Loading…" : (selected?.name ?? "Subtask");
    return (
      <span
        className="inline-flex h-7 items-center rounded-md border border-border/60 bg-muted/20 px-2 text-[12px] text-muted-foreground"
        title={reachable ? undefined : "Child issue type is fixed to this project's default."}
      >
        {label}
      </span>
    );
  }

  return (
    <Select value={value ?? selected?.id ?? null} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger size="sm" aria-label="Child issue type" disabled={disabled}>
        <SelectValue placeholder="Issue type">{selected?.name}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
