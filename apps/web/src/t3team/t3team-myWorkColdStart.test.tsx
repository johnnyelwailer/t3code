// @vitest-environment jsdom
/**
 * The cold start, from the user's side.
 *
 * Opening My Work for the first time in an app session used to show "Nothing needs you" — the
 * project list had not finished hydrating, so the digest was scoped to a smaller set that came
 * back legitimately empty, and nothing distinguished that from a settled answer. Navigating away
 * and back "fixed" it, because the remount read the full list hydration had meanwhile written.
 *
 * So: the empty copy may appear only after a fresh, successful round for the scope on screen.
 * Every other shape of "no items" is loading, and says so.
 */
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { UseMyWorkDigestGraphResult } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraphTypes";

const LOADING_LABEL = "Loading My Work";
const EMPTY_COPY = "Nothing needs you";

const boundProject = {
  id: "project-1",
  title: "Nexplore Platform",
  source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "ext-1", raw: {} },
} as unknown as ProjectShellProject;

const emptyGraph: DigestGraph = {
  scope: "all",
  projects: [],
  viewer: { name: "Philip", role: "", lastVisitAt: "1970-01-01T00:00:00.000Z" },
  tickets: [],
  claims: [],
  decisions: [],
  changeRequests: [],
  transitions: [],
  blockers: [],
};

const digest: { result: UseMyWorkDigestGraphResult } = {
  result: {
    graph: null,
    status: "loading",
    freshness: "cached",
    refreshing: false,
    viewerUnresolved: false,
    sessionExpired: false,
    reload: () => {},
  },
};
const bound: { projects: ReadonlyArray<ProjectShellProject> | null } = { projects: null };

vi.mock("~/t3team/mywork-digest/t3team-useMyWorkDigestGraph", () => ({
  useMyWorkDigestGraph: () => digest.result,
}));
vi.mock("~/t3team/t3team-myWorkBoundProjects", () => ({
  useMyWorkBoundProjects: () => bound.projects,
}));
vi.mock("~/t3team/t3team-projectDashboardMyWorkState", () => ({
  useProjectDashboardMyWorkState: () => ({ state: { lens: "digest" }, setState: () => {} }),
}));
vi.mock("~/t3team/hooks/t3team-useTicketAgentContext", () => ({
  useTicketAgentContext: () => ({
    getTicketAgentContext: () => null,
    openTicketAgentContextMenu: () => {},
  }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {} }));

const { AllProjectsMyWorkView } = await import("~/t3team/t3team-AllProjectsMyWorkView");
const { AllProjectsMyWorkDigestLens } = await import("~/t3team/t3team-AllProjectsMyWorkDigestLens");

function setDigest(overrides: Partial<UseMyWorkDigestGraphResult>) {
  digest.result = { ...digest.result, ...overrides };
}

const renderLens = () =>
  renderToStaticMarkup(
    <AllProjectsMyWorkDigestLens boundProjects={[boundProject]} onOpenTicket={() => {}} />,
  );

describe("My Work cold start", () => {
  it("loads, rather than claiming nothing, while the project list is still being assembled", () => {
    bound.projects = null;
    const markup = renderToStaticMarkup(<AllProjectsMyWorkView onOpenTicket={() => {}} />);
    expect(markup).toContain(LOADING_LABEL);
    expect(markup).not.toContain(EMPTY_COPY);
    // And not the "connect a project" copy either: an unknown list is not an empty one.
    expect(markup).not.toContain("No projects are connected to a work source yet");
  });

  it("loads while the first poll for the scope is still out", () => {
    bound.projects = [boundProject];
    setDigest({ graph: null, status: "loading", freshness: "cached" });
    const markup = renderLens();
    expect(markup).toContain(LOADING_LABEL);
    expect(markup).not.toContain(EMPTY_COPY);
  });

  it("keeps loading when a cached graph plans to nothing and the server has not answered", () => {
    // The persisted cache painted last session's graph. It is not an answer about this scope.
    bound.projects = [boundProject];
    setDigest({ graph: emptyGraph, status: "ready", freshness: "cached", refreshing: true });
    const markup = renderLens();
    expect(markup).toContain(LOADING_LABEL);
    expect(markup).not.toContain(EMPTY_COPY);
  });

  it("keeps loading when a slow first poll left the status on 'ready' from the cache", () => {
    bound.projects = [boundProject];
    setDigest({ graph: null, status: "ready", freshness: "cached", refreshing: true });
    expect(renderLens()).not.toContain(EMPTY_COPY);
  });

  it("says 'Nothing needs you' once a fresh round came back with nothing", () => {
    bound.projects = [boundProject];
    setDigest({ graph: null, status: "ready", freshness: "fresh", refreshing: false });
    const markup = renderLens();
    expect(markup).toContain(EMPTY_COPY);
    expect(markup).not.toContain(LOADING_LABEL);
  });

  it("says 'Nothing needs you' for a fresh graph whose plan has no sections", () => {
    bound.projects = [boundProject];
    setDigest({ graph: emptyGraph, status: "ready", freshness: "fresh", refreshing: false });
    const markup = renderLens();
    expect(markup).toContain(EMPTY_COPY);
    expect(markup).not.toContain(LOADING_LABEL);
  });

  it("keeps a transient failure out of the empty state", () => {
    bound.projects = [boundProject];
    setDigest({ graph: null, status: "retrying", freshness: "cached" });
    expect(renderLens()).not.toContain(EMPTY_COPY);
  });

  it("marks a cached paint as refreshing instead of presenting it as settled", () => {
    bound.projects = [boundProject];
    setDigest({
      graph: { ...emptyGraph, jiraSyncedAt: "2026-09-14T08:00:00.000Z" },
      status: "ready",
      freshness: "cached",
      refreshing: true,
    });
    expect(renderLens()).toContain("Refreshing…");
  });
});
