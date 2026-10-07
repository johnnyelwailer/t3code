/**
 * Cold-start gate on the index route: opens My Work when it has something to show, otherwise
 * renders `children` (the draft landing) unchanged. Nothing paints while it decides, so the draft
 * landing never flashes before a redirect; the wait is bounded so a slow Jira never blocks startup.
 *
 * The probe reads the same inputs `AllProjectsMyWorkView` does — bound projects, the all-projects
 * digest graph, the resolved lens — and the digest hook caches its graph per scope, so My Work
 * paints from that cache right after the redirect instead of fetching again.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";

import { isElectron } from "~/env";
import { useNowMinute } from "~/hooks/useNowMinute";
import { useAllEnvironmentShellsBootstrapped, useProjects } from "~/state/entities";
import { BackendProvider, createT3Backend } from "~/t3team/backend/t3team-index";
import { hydrateStoredProjects } from "~/t3team/hooks/t3team-projectStorePersistence";
import {
  deriveLooseWorkspaceProjects,
  loadStoredProjects,
  reconcileStoredProjectsWithLive,
} from "~/t3team/hooks/t3team-projectStoreUtils";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { selectBoundProjects } from "~/t3team/t3team-allProjectsMyWorkProjects";
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
  const boundProjects = useStartupBoundProjects();
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

  return null;
}

const EMPTY_PROJECTS: ReadonlyArray<ProjectShellProject> = [];

/** `AllProjectsMyWorkView`'s bound projects, or `null` until stored and live projects are loaded. */
function useStartupBoundProjects(): ReadonlyArray<ProjectShellProject> | null {
  const liveProjects = useProjects();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const [storedProjects, setStoredProjects] = useState<ProjectShellProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hydrateStoredProjects()
      .catch(() => loadStoredProjects())
      .then((projects) => {
        if (!cancelled) setStoredProjects(projects);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    if (storedProjects === null || !bootstrapped) return null;
    return selectBoundProjects([
      ...reconcileStoredProjectsWithLive(storedProjects, liveProjects),
      ...deriveLooseWorkspaceProjects(storedProjects, liveProjects),
    ]);
  }, [bootstrapped, liveProjects, storedProjects]);
}
