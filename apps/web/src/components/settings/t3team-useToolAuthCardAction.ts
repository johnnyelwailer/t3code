/**
 * Makes an Install/Connect click visible immediately. The card's phase came only from
 * `subscribeToolAuth`, so a request answered without starting a flow left the button untouched.
 * Pending is local, failure comes from the answer too, and a patience window reports silence.
 * @module components/settings/useToolAuthCardAction
 */
import type { ToolAuthPhase } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import type { ToolAuthFailureKind } from "../../state/t3team-toolAuthFailureMessage";
import type { ToolAuthActionOutcome } from "../../state/t3team-toolauthActionOutcome";

/** Long enough for an npm install to print its first line, short enough to not read as a hang. */
export const TOOL_AUTH_ACTION_TIMEOUT_MS = 15_000;

export interface ToolAuthCardAction {
  /** A click has been sent and neither the stream nor the RPC has answered yet. */
  readonly pending: boolean;
  /** Set by the RPC's answer or by the patience window; cleared by the next click. */
  readonly failure: ToolAuthFailureKind | null;
  readonly run: () => void;
}

export function useToolAuthCardAction(input: {
  readonly action: () => Promise<ToolAuthActionOutcome> | void;
  /** The phase the status stream currently reports; its first change clears pending. */
  readonly phase: ToolAuthPhase;
  readonly timeoutMs?: number;
}): ToolAuthCardAction {
  const { action, phase } = input;
  const timeoutMs = input.timeoutMs ?? TOOL_AUTH_ACTION_TIMEOUT_MS;
  const [startPhase, setStartPhase] = useState<ToolAuthPhase | null>(null);
  const [failure, setFailure] = useState<ToolAuthFailureKind | null>(null);
  const inFlight = useRef(false);

  // The stream answering is what ends the wait, so a phase that still reads as it did at click
  // time is a request nothing has acknowledged.
  const pending = startPhase !== null && phase === startPhase;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- arms the patience window, a timer outside React
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setStartPhase(null);
      setFailure("noResponse");
    }, timeoutMs);
    return () => {
      clearTimeout(timer);
    };
  }, [pending, timeoutMs]);

  const run = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailure(null);
    setStartPhase(phase);
    const sent = action();
    if (sent === undefined) {
      inFlight.current = false;
      setStartPhase(null);
      return;
    }
    void sent.then(
      (outcome) => {
        inFlight.current = false;
        if (outcome.kind === "started") return;
        setStartPhase(null);
        if (outcome.kind === "failed") setFailure(outcome.reason);
      },
      () => {
        inFlight.current = false;
        setStartPhase(null);
        setFailure("requestFailed");
      },
    );
  };

  return { pending, failure, run };
}
