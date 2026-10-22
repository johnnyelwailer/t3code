import type { ToolAuthPhase, ToolAuthState } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { toolAuthStateIsForHost } from "~/cloud/t3team-cloudSessionSignIn";
import { toolAuthMetaForTool } from "~/components/settings/t3team-toolAuthTools";
import { useLiveRefresh } from "~/hooks/useLiveRefresh";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useToolAuthActions, useToolAuthStatesQuery } from "~/state/t3team-toolauth";

const GH = toolAuthMetaForTool("gh");

const FLOW_PHASES: ReadonlySet<ToolAuthPhase> = new Set([
  "installing",
  "starting",
  "awaiting-open",
  "awaiting-code",
  "verifying",
]);

export function isGitHubSignInRunning(phase: ToolAuthPhase): boolean {
  return FLOW_PHASES.has(phase);
}

/**
 * Hosts worth offering a sign-in to: the ones the caller knows about, the deployment's default gh
 * login host (the GHE instance), and github.com, without repeats.
 */
export function useGitHubSignInHosts(known: ReadonlyArray<string>): ReadonlyArray<string> {
  const defaultHost = useToolAuthStatesQuery(usePrimaryEnvironmentId()).states.get(
    GH.tool,
  )?.hostname;
  const hosts = [...known, defaultHost, "github.com"];
  return [...new Set(hosts.filter((host): host is string => host !== undefined && host !== ""))];
}

export interface GitHubSignIn {
  /** gh's state for this host only; another host's state reads as not started. */
  readonly state: ToolAuthState | undefined;
  readonly start: () => void;
  readonly cancel: () => void;
}

/**
 * The in-app gh device sign-in for one host (the Connected tools flow, `toolAuth.start` with that
 * host). `onSignedIn` runs when gh reports the host connected after this view saw it otherwise,
 * including a login done in a terminal: while not connected, gh is asked again on focus and
 * return, like any live view. A host already connected on arrival does not fire it, so a caller
 * that remounts this while it rechecks cannot loop.
 */
export function useGitHubSignIn(host: string, onSignedIn?: () => void): GitHubSignIn {
  const environmentId = usePrimaryEnvironmentId();
  const { states, recheck } = useToolAuthStatesQuery(environmentId);
  const ghState = states.get(GH.tool);
  const state = toolAuthStateIsForHost(ghState, host) ? ghState : undefined;
  const phase = state?.phase ?? "idle";
  const { onConnect, onCancel } = useToolAuthActions(GH, environmentId, { hostname: host });

  // One key for every host: they share one status stream, so one recheck answers them all.
  useLiveRefresh(recheck, {
    enabled: phase !== "connected" && !isGitHubSignInRunning(phase),
    key: "github-sign-in",
  });

  const onSignedInRef = useRef(onSignedIn);
  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  }, [onSignedIn]);
  const previousPhaseRef = useRef<ToolAuthPhase | undefined>(undefined);
  const reportedPhase = state?.phase;
  useEffect(() => {
    if (reportedPhase === undefined) return;
    const previous = previousPhaseRef.current;
    previousPhaseRef.current = reportedPhase;
    if (reportedPhase === "connected" && previous !== undefined && previous !== "connected") {
      onSignedInRef.current?.();
    }
  }, [reportedPhase]);

  return { state, start: onConnect, cancel: onCancel };
}
