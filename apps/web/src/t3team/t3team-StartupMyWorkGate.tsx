/**
 * Cold-start gate on the index route: opens My Work when it has something to show, otherwise
 * renders `children` (the draft landing) unchanged. The draft landing never flashes before a
 * redirect; the wait is bounded so a slow Jira never blocks startup.
 *
 * While it decides it renders My Work's own loading animation — the same art My Work then shows
 * for its first load, so the hand-off has nothing to jump between. (It used to render `null`,
 * which left the window blank for up to two seconds.)
 *
 * The probe reads the same inputs `AllProjectsMyWorkView` does, through the SAME hook
 * (`useMyWorkBoundProjects`): one hydration, one project list, therefore one digest scope
 * signature — which is what makes My Work paint from this probe's cached graph after the redirect
 * instead of fetching again.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";

import { isElectron } from "~/env";
import { useNowMinute } from "~/hooks/useNowMinute";
import { BackendProvider, createT3Backend } from "~/t3team/backend/t3team-index";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { MyWorkLoadingAnimation } from "~/t3team/t3team-MyWorkLoadingAnimation";
import { useMyWorkBoundProjects } from "~/t3team/t3team-myWorkBoundProjects";
import {
  getProjectDashboardMyWorkStorageKey,
  readPersistedProjectDashboardMyWorkState,
  resolveProjectDashboardMyWorkState,
} from "~/t3team/t3team-projectDashboardMyWorkState";
import { resolveWsBaseUrl } from "~/t3team/t3team-route-surface-wsUrl";
import {
  decideStartupLanding,
  deriveStartupMyWorkProbe,
  isIndexBootUrl,
  isStartupLandingPending,
  markStartupLandingDecided,
  readBootUrl,
} from "~/t3team/t3team-startupLanding.logic";

/** Longest the cold start waits on My Work before showing the regular landing. */
const STARTUP_MY_WORK_TIMEOUT_MS = 2_000;

/** The All-projects My Work view keys its state under this pseudo project id. */
const ALL_PROJECTS_MY_WORK_ID = "all";

function readStartupLandingEligible(): boolean {
  return isStartupLandingPending() && isIndexBootUrl(readBootUrl() ?? "", isElectron);
}

export function T3TeamStartupMyWorkGate({ children }: { readonly children: ReactNode }) {
  const [eligible] = useState(readStartupLandingEligible);
  const [fellBack, setFellBack] = useState(false);
  const [backend] = useState(() => (eligible ? createT3Backend(resolveWsBaseUrl()) : null));
  const fallBack = useCallback(() => setFellBack(true), []);
  // Claim the session's one decision as soon as it starts: a user who clicks away mid-wait and
  // later comes back to `/` chose the index, and must not be bounced to My Work then.
  useEffect(() => {
    if (eligible) markStartupLandingDecided();
  }, [eligible]);

  if (!eligible || fellBack || backend === null) return children;
  return (
    <BackendProvider backend={backend}>
      <StartupMyWorkProbe onFallback={fallBack} />
    </BackendProvider>
  );
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
