import { useEffect, useRef, useState, type MouseEvent } from "react";

import { getProjectTicketEstimatePresentation } from "~/t3team/t3team-projectBacklogEstimate";
import { isProjectTicketHourTracked } from "~/t3team/t3team-projectBacklogUtils";
import type { ProjectTicket } from "~/t3team/t3team-types";

/**
 * Draft, commit and stepping behaviour behind the estimate cell.
 *
 * Split from the cell so the component is markup: the cell had grown past the 200-line cap once it
 * gained unit-aware ± stepping, and the two halves change for different reasons — this one when the
 * write or validation rules move, the other when the row's appearance does.
 *
 * Controlled or uncontrolled: the backlog table owns the draft across a whole row, while a standalone
 * cell keeps its own.
 */
export function useProjectBacklogEstimateCell(input: {
  readonly ticket: ProjectTicket;
  readonly estimateFieldLabel?: string | undefined;
  readonly onUpdateEstimate: (ticket: ProjectTicket, estimateValue: number | null) => Promise<void>;
  readonly draftValue?: string | undefined;
  readonly onDraftChange?: ((value: string) => void) | undefined;
}) {
  const { ticket, estimateFieldLabel, onUpdateEstimate, draftValue, onDraftChange } = input;

  const presentation = getProjectTicketEstimatePresentation(
    ticket,
    estimateFieldLabel ? { storyPointsLabel: estimateFieldLabel } : undefined,
  );
  const persistedDraft =
    presentation.numericValue !== undefined ? String(presentation.numericValue) : "";

  const isControlled = draftValue !== undefined && onDraftChange !== undefined;
  const [internalDraft, setInternalDraft] = useState(persistedDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  const draft = isControlled ? draftValue : internalDraft;

  useEffect(() => {
    if (!isControlled) setInternalDraft(persistedDraft);
  }, [isControlled, persistedDraft]);

  function updateDraft(value: string) {
    setError(null);
    if (isControlled) {
      onDraftChange(value);
      return;
    }
    setInternalDraft(value);
  }

  function focusAndSelectInput() {
    const input_ =
      inputContainerRef.current?.querySelector<HTMLInputElement>('[data-slot="input"]');
    if (!input_ || input_.disabled) return;
    input_.focus();
    input_.select();
  }

  /** Clicking the field's padding should focus it, but clicking the input itself must not re-focus. */
  function handleWrapperMouseDown(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('[data-slot="input"]')) return;
    event.preventDefault();
    focusAndSelectInput();
  }

  async function save(value: number | null) {
    setSaving(true);
    setError(null);
    try {
      await onUpdateEstimate(ticket, value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save estimate.");
    } finally {
      setSaving(false);
    }
  }

  /* Step size follows the resolved unit — half-hours for time, whole story points. */
  const stepSize = presentation.valueSuffix === "H" ? 0.5 : 1;

  async function step(delta: number) {
    const current = Number(draft.trim());
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, Math.round((base + delta) / stepSize) * stepSize);
    updateDraft(next === 0 ? "" : String(next));
    await save(next === 0 ? null : next);
  }

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      await save(null);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Estimate must be a non-negative number.");
      return;
    }

    await save(parsed);
  }

  return {
    presentation,
    persistedDraft,
    draft,
    isControlled,
    saving,
    error,
    setError,
    inputContainerRef,
    available: isProjectTicketHourTracked(ticket) || Boolean(estimateFieldLabel),
    stepSize,
    updateDraft,
    handleWrapperMouseDown,
    step,
    commit,
  };
}
