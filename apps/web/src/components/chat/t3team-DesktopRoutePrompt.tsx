import type { DesktopRouteCard, ScopedThreadRef } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { usePrimaryEnvironmentId, useCloudSessions } from "../../state/t3team-cloudSessions";
import { T3TeamDesktopRouteCard } from "./t3team-DesktopRouteCard";

/** Matches the pending panel's own pause between picking an answer and submitting it. */
const SUBMIT_DELAY_MS = 150;

/**
 * Names the cloud session the thread belongs to (its own environment's, never a value the question
 * carries) and answers through the ordinary user-input path: select the option, then advance.
 */
export function T3TeamDesktopRoutePrompt(props: {
  readonly card: DesktopRouteCard;
  readonly questionId: string;
  readonly threadRef: ScopedThreadRef;
  readonly disabled: boolean;
  readonly onToggleOption: (questionId: string, optionValue: string) => void;
  readonly onAdvance: () => void;
}) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { sessions } = useCloudSessions(props.threadRef.environmentId !== primaryEnvironmentId);
  const [answered, setAnswered] = useState(false);
  const timer = useRef<number | null>(null);
  const matches = sessions.filter(
    (session) => session.environmentId === props.threadRef.environmentId,
  );
  const [only] = matches;
  const sessionLabel =
    matches.length === 1 && only !== undefined
      ? `${only.name ?? "Cloud session"} (#${only.sessionId})`
      : "This cloud session";
  return (
    <T3TeamDesktopRouteCard
      card={props.card}
      sessionLabel={sessionLabel}
      disabled={props.disabled || answered}
      onAnswer={(label) => {
        setAnswered(true);
        props.onToggleOption(props.questionId, label);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(props.onAdvance, SUBMIT_DELAY_MS);
      }}
    />
  );
}
