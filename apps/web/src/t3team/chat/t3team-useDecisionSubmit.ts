import { useState } from "react";

import type { WorkflowDecisionChooseHandler } from "./t3team-messageDecisionCard";

/**
 * Optimistic-lock a decision card on the chosen label while its answer is in flight, and keep the
 * failure: a rejected answer (the environment is unreachable, the ask is no longer pending, the
 * credential was refused) re-enables the card and says why, instead of looking like nothing
 * happened.
 */
export function useDecisionSubmit(onChoose: WorkflowDecisionChooseHandler | undefined) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (choice: string, value: unknown, correlationId: string) => {
    if (!onChoose) return;
    setSubmitting(choice);
    setError(null);
    void (async () => {
      try {
        await onChoose({ choice, value, correlationId });
      } catch (cause) {
        setError(
          cause instanceof Error && cause.message.length > 0
            ? cause.message
            : "Couldn't send that answer. Try again.",
        );
      } finally {
        setSubmitting((current) => (current === choice ? null : current));
      }
    })();
  };

  return { submitting, error, submit };
}
