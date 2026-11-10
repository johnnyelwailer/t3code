import type { DesktopRouteCard, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import { desktopRouteTargetResolves } from "../../cloud/t3team-desktopRouteResolveCheck";
import { usePrimaryEnvironmentId, useCloudSessions } from "../../state/t3team-cloudSessions";
import { T3TeamDesktopRouteCard } from "./t3team-DesktopRouteCard";
import { desktopRouteSessionLabel } from "./t3team-desktopRouteSessionLabel";

/** Matches the pending panel's own pause between picking an answer and submitting it. */
const SUBMIT_DELAY_MS = 150;
const RETRY_AFTER_MS = 4_000;

/**
 * Names the cloud session from the thread's own environment and answers through the ordinary
 * user-input path: select the option, then advance. A submit that fails leaves the request
 * pending, so the card re-enables once the response is no longer in flight.
 */
export function T3TeamDesktopRoutePrompt(props: {
  readonly card: DesktopRouteCard;
  readonly questionId: string;
  readonly threadRef: ScopedThreadRef;
  readonly disabled: boolean;
  readonly responding: boolean;
  readonly onToggleOption: (questionId: string, optionValue: string) => void;
  readonly onAdvance: () => void;
}) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { sessions } = useCloudSessions(props.threadRef.environmentId !== primaryEnvironmentId);
  const [answered, setAnswered] = useState(false);
  const [sawResponding, setSawResponding] = useState(false);
  const timer = useRef<number | null>(null);
  if (props.responding && !sawResponding) setSawResponding(true);
  if (!props.responding && sawResponding) {
    setSawResponding(false);
    setAnswered(false);
  }
  const [unresolved, setUnresolved] = useState<string | null>(null);
  const local = props.threadRef.environmentId === primaryEnvironmentId;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the desktop route service once per host
  useEffect(() => {
    if (local) return;
    let live = true;
    void desktopRouteTargetResolves(props.card.target).then((resolves) => {
      if (live) setUnresolved(resolves === false ? props.card.target : null);
    });
    return () => {
      live = false;
    };
  }, [local, props.card.target]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears the pending submit timer on unmount
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <T3TeamDesktopRouteCard
      card={props.card}
      sessionLabel={desktopRouteSessionLabel(
        props.threadRef.environmentId,
        primaryEnvironmentId,
        sessions,
      )}
      hostUnresolved={unresolved === props.card.target}
      disabled={props.disabled || props.responding || answered}
      onAnswer={(label) => {
        setAnswered(true);
        props.onToggleOption(props.questionId, label);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          props.onAdvance();
          // If nothing went out (no response in flight by now), let the user answer again.
          timer.current = window.setTimeout(() => setAnswered(false), RETRY_AFTER_MS);
        }, SUBMIT_DELAY_MS);
      }}
    />
  );
}
