import { useEffect, useState } from "react";

import { getProjectTicketEstimatePresentation } from "~/t3team/t3team-projectBacklogEstimate";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function getProjectBacklogTableRowEstimateBaseline(ticket: ProjectTicket): string {
  const presentation = getProjectTicketEstimatePresentation(ticket);
  return presentation.numericValue !== undefined ? String(presentation.numericValue) : "";
}

export function useProjectBacklogTableRowDraft({
  ticket,
  onUpdateEstimate,
}: {
  ticket: ProjectTicket;
  onUpdateEstimate: (ticket: ProjectTicket, estimateValue: number | null) => Promise<void>;
}) {
  const [estimateBaseline, setEstimateBaseline] = useState(
    getProjectBacklogTableRowEstimateBaseline(ticket),
  );
  const [estimateDraft, setEstimateDraftState] = useState(estimateBaseline);
  const [rowSaving, setRowSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    const nextEstimateBaseline = getProjectBacklogTableRowEstimateBaseline(ticket);
    setEstimateBaseline(nextEstimateBaseline);
    setEstimateDraftState(nextEstimateBaseline);
  }, [ticket.estimateValue, ticket.id, ticket.timeOriginalEstimateSeconds]);

  const estimateDirty = estimateDraft.trim() !== estimateBaseline.trim();
  const rowDirty = estimateDirty;

  async function commitRow() {
    if (rowSaving || !rowDirty) {
      return;
    }

    const trimmedEstimate = estimateDraft.trim();
    let nextEstimateValue: number | null = ticket.estimateValue ?? null;
    if (!trimmedEstimate) {
      nextEstimateValue = null;
    } else {
      const parsedValue = Number(trimmedEstimate);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        setRowError("Estimate must be a non-negative number.");
        return;
      }
      nextEstimateValue = parsedValue;
    }

    setRowSaving(true);
    setRowError(null);
    try {
      await onUpdateEstimate(ticket, nextEstimateValue);
      const nextEstimateBaseline = nextEstimateValue === null ? "" : String(nextEstimateValue);
      setEstimateBaseline(nextEstimateBaseline);
      setEstimateDraftState(nextEstimateBaseline);
    } catch (cause) {
      setRowError(cause instanceof Error ? cause.message : "Failed to save row changes.");
    } finally {
      setRowSaving(false);
    }
  }

  return {
    estimateDraft,
    estimateDirty,
    rowDirty,
    rowError,
    rowSaving,
    setEstimateDraft(nextValue: string) {
      setRowError(null);
      setEstimateDraftState(nextValue);
    },
    resetEstimateDraft() {
      setRowError(null);
      setEstimateDraftState(estimateBaseline);
    },
    commitRow,
  };
}
