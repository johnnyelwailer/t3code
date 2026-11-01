import type { DesktopRouteCard, EnvironmentId, RuntimeRequestId } from "@t3tools/contracts";
import type { ThreadUserInputQuestion } from "@t3tools/client-runtime/state/thread-requests";
import { useEffect, useRef, useState } from "react";

import { useEnvironmentPresentation } from "../../state/presentation";
import { T3TeamDesktopRouteCard } from "./t3team-DesktopRouteCard";

/**
 * One tap answers: select the option through the ordinary draft path, then submit once the draft
 * holds it. The session is named from the thread's own environment, never from the question.
 */
export function T3TeamDesktopRouteQuestion(props: {
  readonly card: DesktopRouteCard;
  readonly question: ThreadUserInputQuestion;
  readonly requestId: RuntimeRequestId;
  readonly environmentId: EnvironmentId;
  readonly disabled: boolean;
  readonly answers: Record<string, string | ReadonlyArray<string>> | null;
  readonly onSelectOption: (
    requestId: RuntimeRequestId,
    question: ThreadUserInputQuestion,
    value: string,
  ) => void;
  readonly onSubmit: () => Promise<unknown>;
}) {
  const { presentation } = useEnvironmentPresentation(props.environmentId);
  const [chosen, setChosen] = useState<string | null>(null);
  const submitted = useRef(false);
  const { answers, onSubmit } = props;
  const questionId = props.question.id;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- submits once the draft state holds the tapped answer
  useEffect(() => {
    if (chosen === null || submitted.current) return;
    if (answers?.[questionId] !== chosen) return;
    submitted.current = true;
    void onSubmit().then((result) => {
      const ok =
        typeof result === "object" &&
        result !== null &&
        "_tag" in result &&
        result._tag === "Success";
      if (ok) return;
      // Not sent (refused or failed): let the user answer again.
      submitted.current = false;
      setChosen(null);
    });
  }, [chosen, answers, questionId, onSubmit]);
  return (
    <T3TeamDesktopRouteCard
      card={props.card}
      sessionLabel={presentation?.entry.target.label ?? "This cloud session"}
      disabled={props.disabled || chosen !== null}
      onAnswer={(label) => {
        setChosen(label);
        props.onSelectOption(props.requestId, props.question, label);
      }}
    />
  );
}
