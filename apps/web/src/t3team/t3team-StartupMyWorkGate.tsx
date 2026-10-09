/**
 * Cold-start gate on the Team home (`/` is bridged to `/t3team` before any index route renders):
 * opens My Work when it has something to show, otherwise renders `children` (the new-conversation
 * home) unchanged. The home never flashes before a redirect; the wait is bounded so a slow Jira
 * never blocks startup.
 *
 * While it decides it renders My Work's own loading animation — the same art My Work then shows
 * for its first load, so the hand-off has nothing to jump between.
 *
 * The probe reads the same inputs `AllProjectsMyWorkView` does, through the SAME hook
 * (`useMyWorkBoundProjects`) and the shell's own backend: one hydration, one project list,
 * therefore one digest scope signature — which is what makes My Work paint from this probe's
 * cached graph after the redirect instead of fetching again.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";

import { isElectron } from "~/env";
import { useNowMinute } from "~/hooks/useNowMinute";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { MyWorkLoadingAnimation } from "~/t3team/t3team-MyWorkLoadingAnimation";
import { useMyWorkBoundProjects } from "~/t3team/t3team-myWorkBoundProjects";
import {
  getProjectDashboardMyWorkStorageKey,
  readPersistedProjectDashboardMyWorkState,
  resolveProjectDashboardMyWorkState,
} from "~/t3team/t3team-projectDashboardMyWorkState";
import {
  claimStartupGate,
  decideStartupLanding,
  deriveStartupMyWorkProbe,
  isIndexBootUrl,
  isStartupGateUnclaimed,
  isStartupLandingPending,
  markStartupLandingDecided,
  readBootUrl,
} from "~/t3team/t3team-startupLanding.logic";

/** Longest the cold start waits on My Work before showing the regular landing. */
const STARTUP_MY_WORK_TIMEOUT_MS = 2_000;

/** The All-projects My Work view keys its state under this pseudo project id. */
const ALL_PROJECTS_MY_WORK_ID = "all";

/**
 * Whether this mount is the session's cold start on the home. Call it where the Team shell's main
 * content first mounts, whatever it shows: the first mount claims the session's one decision, so
 * a later return to the home — after a deep link, a project dashboard, or leaving My Work on
 * purpose — never redirects.
 */
export function useStartupLandingEligible(): boolean {
  const [eligible] = useState(
    () => isStartupLandingPending() && isIndexBootUrl(readBootUrl() ?? "", isElectron),
  );
  useEffect(() => {
    markStartupLandingDecided();
  }, []);
  return eligible;
}

export function T3TeamStartupMyWorkGate({
  eligible,
  children,
}: {
  readonly eligible: boolean;
  readonly children: ReactNode;
}) {
  const [active] = useState(() => eligible && isStartupGateUnclaimed());
  const [fellBack, setFellBack] = useState(false);
  const fallBack = useCallback(() => setFellBack(true), []);
  useEffect(() => {
    if (active) claimStartupGate();
  }, [active]);
  if (!active || fellBack) return children;
  return <StartupMyWorkProbe onFallback={fallBack} />;
}

function StartupMyWorkProbe({ onFallback }: { readonly onFallback: () => void }) {
  const navigate = useNavigate();
  const boundProjects = useMyWorkBoundProjects();
  const [lens] = useState(
    () =>
      resolveProjectDashboardMyWorkState({
        persisted: readPersistedProjectDashboardMyWorkState(
          getProjectDashboardMyWorkStorageKey(ALL_PROJECTS_MY_WORK_ID),
        ),
      }).lens,
  );
  const digest = useMyWorkDigestGraph({
    projects: boundProjects ?? EMPTY_PROJECTS,
    scope: "all",
    enabled: (boundProjects?.length ?? 0) > 0,
  });
  const nowMs = Date.parse(`${useNowMinute()}Z`);
  const [timedOut, setTimedOut] = useState(false);
  const actedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), STARTUP_MY_WORK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const decision = decideStartupLanding({
    eligible: true,
    probe: deriveStartupMyWorkProbe({ boundProjects, digest, lens, nowMs }),
    timedOut,
  });

  useEffect(() => {
    if (decision === "wait" || actedRef.current) return;
    actedRef.current = true;
    if (decision === "my-work") {
      void navigate({ to: "/t3team/my-work", replace: true });
    } else {
      onFallback();
    }
  }, [decision, navigate, onFallback]);

  // The gap the animation fills: whichever way this lands, the next paint is My Work's first load
  // or the draft landing, and neither should be preceded by a blank window.
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden p-4 sm:p-6">
      <MyWorkLoadingAnimation />
    </div>
  );
}

const EMPTY_PROJECTS: ReadonlyArray<ProjectShellProject> = [];
