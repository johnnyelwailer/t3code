import { Minus, Plus } from "lucide-react";

import { Input } from "~/t3team/components/ui/t3team-input";
import { parseWorkItemEstimateDraft } from "~/t3team/workitem/t3team-workItemEstimateParsing";

const STEP_HOURS = 0.5;

/**
 * The stepper interaction the user pointed to in the planning-space prototype's `HourStepper` —
 * ± buttons flanking the value, not a bare number field — built fresh against the free-text hours
 * draft this form already carries (`ProjectBacklogSubtaskCreateInput.estimateHours`) rather than
 * against that prototype's mock second-based ladder, which has no real backend behind it. Reuses
 * `parseWorkItemEstimateDraft` so this form validates estimates exactly like `WorkItemEstimateControl`.
 */
export function ChildIssueEstimateField({
  hoursText,
  onChange,
  disabled,
}: {
  readonly hoursText: string;
  readonly onChange: (next: string) => void;
  readonly disabled?: boolean;
}) {
  const parsed = parseWorkItemEstimateDraft(hoursText);
  const numeric = parsed.ok ? (parsed.value ?? 0) : 0;

  function step(delta: number) {
    const next = Math.max(0, Math.round((numeric + delta) * 2) / 2);
    onChange(next === 0 ? "" : String(next));
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label="Decrease estimate"
        disabled={disabled || numeric <= 0}
        className="flex size-6 items-center justify-center rounded border border-border/70 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => step(-STEP_HOURS)}
      >
        <Minus className="size-3" />
      </button>
      <Input
        aria-label="Estimated hours"
        disabled={disabled}
        inputMode="decimal"
        size="sm"
        className="w-14 text-center text-[12px] tabular-nums"
        value={hoursText}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
      />
      <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">h</span>
      <button
        type="button"
        aria-label="Increase estimate"
        disabled={disabled}
        className="flex size-6 items-center justify-center rounded border border-border/70 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => step(STEP_HOURS)}
      >
        <Plus className="size-3" />
      </button>
      {!parsed.ok ? <span className="text-[10px] text-destructive">{parsed.error}</span> : null}
    </div>
  );
}
