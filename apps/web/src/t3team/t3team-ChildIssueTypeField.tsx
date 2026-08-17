/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import { cn } from "~/t3team/lib/t3team-utils";
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
    /*
      Never label this "Subtask" on a guess. It previously fell back to that word whenever the list
      was empty, so a project whose types could not be read looked identical to one with a single
      type called Subtask — and Create then failed with "no subtask issue type was detected". The
      field now shows only a name Jira actually returned, and says so plainly when it has none.
    */
    const resolved = loading ? "Loading…" : selected?.name;
    return (
      <span
        className={cn(
          "inline-flex h-7 items-center rounded-md border px-2 text-[12px]",
          resolved
            ? "border-border/60 bg-muted/20 text-muted-foreground"
            : "border-destructive/40 bg-destructive/10 text-destructive",
        )}
        title={
          resolved
            ? reachable
              ? undefined
              : "Child issue type is fixed to this project's default."
            : "Jira returned no child issue type for this project, so a child cannot be created here."
        }
      >
        {resolved ?? "No child type"}
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
