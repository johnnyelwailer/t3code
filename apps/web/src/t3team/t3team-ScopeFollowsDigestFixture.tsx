import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useT3TeamScopeRouteSync } from "~/t3team/hooks/t3team-useScopeRouteSync";
import { ProjectMyWorkDigestHeader } from "~/t3team/t3team-ProjectMyWorkDigestHeader";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { DIGEST_FIXTURE_NOW_MS, IES, NXAI } from "~/t3team/t3team-projectMyWorkDigestFixtures";
import { allProjectsHeuristicScenario } from "~/t3team/t3team-projectMyWorkDigestFixtureScenariosAllProjects";
import { parseT3TeamRouteSearch, parseT3TeamViewFromPath } from "~/t3team/t3team-routeState";

const ALL_PROJECTS_GRAPH = allProjectsHeuristicScenario.graph;
const SCOPES = [
  { key: null, label: "All projects" },
  { key: IES.id, label: IES.name },
  { key: NXAI.id, label: NXAI.name },
];

function projectGraph(projectId: string): DigestGraph {
  const tickets = ALL_PROJECTS_GRAPH.tickets.filter((ticket) => ticket.projectId === projectId);
  const ticketIds = new Set(tickets.map((ticket) => ticket.id));
  return {
    ...ALL_PROJECTS_GRAPH,
    scope: "project",
    projects: ALL_PROJECTS_GRAPH.projects.filter((project) => project.id === projectId),
    tickets,
    claims: ALL_PROJECTS_GRAPH.claims.filter((claim) => ticketIds.has(claim.ticketId)),
    decisions: ALL_PROJECTS_GRAPH.decisions.filter((decision) => ticketIds.has(decision.ticketId)),
    changeRequests: ALL_PROJECTS_GRAPH.changeRequests.filter((request) =>
      ticketIds.has(request.ticketId),
    ),
  };
}

function RouteDigest() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const view = parseT3TeamViewFromPath(pathname, parseT3TeamRouteSearch(search));
  const graph = view?.type === "dashboard" ? projectGraph(view.projectId) : ALL_PROJECTS_GRAPH;
  const plan = useMemo(
    () =>
      resolveDigestPlan(
        buildHeuristicDigestPlan(graph, DIGEST_FIXTURE_NOW_MS),
        graph,
        DIGEST_FIXTURE_NOW_MS,
      ),
    [graph],
  );
  const heading = graph.scope === "all" ? "All projects" : (graph.projects[0]?.name ?? "");
  return (
    <section aria-label="Digest" data-digest-scope={graph.scope}>
      <h2 className="mb-3 font-semibold text-lg">{heading}</h2>
      <ProjectMyWorkDigestHeader
        graph={graph}
        nowMs={DIGEST_FIXTURE_NOW_MS}
        burndownVariant="off"
      />
      <ProjectMyWorkDigestView plan={plan} graph={graph} nowMs={DIGEST_FIXTURE_NOW_MS} />
    </section>
  );
}

function ScopeFollowsDigestShell() {
  const router = useRouter();
  const [scopeKey, setScopeKey] = useState<string | null>(null);
  useT3TeamScopeRouteSync(scopeKey, scopeKey, scopeKey === null ? undefined : [scopeKey]);
  return (
    <div className="min-h-screen space-y-4 bg-background p-6 text-foreground">
      <div
        className="flex flex-wrap items-center gap-2"
        role="radiogroup"
        aria-label="Project scope"
      >
        {SCOPES.map((scope) => (
          <button
            key={scope.label}
            type="button"
            role="radio"
            aria-checked={scope.key === scopeKey}
            className="rounded-full border px-3 py-1 text-sm aria-checked:bg-foreground aria-checked:text-background"
            onClick={() => setScopeKey(scope.key)}
          >
            {scope.label}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto rounded-md border px-3 py-1 text-sm"
          onClick={() =>
            void router.navigate({
              to: "/t3team/projects/$projectId",
              params: { projectId: NXAI.id },
              search: { projectView: "my-work" },
            })
          }
        >
          Back from a Nexi AI ticket
        </button>
      </div>
      <RouteDigest />
    </div>
  );
}

function createScopeFollowsDigestRouter() {
  const rootRoute = createRootRoute({ component: ScopeFollowsDigestShell });
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: "/t3team/my-work" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/t3team/projects/$projectId" }),
  ];
  return createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/t3team/my-work"] }),
  });
}

/** The real scope-to-route sync and the real digest view over an in-memory router and fixtures. */
export function ScopeFollowsDigestFixture() {
  const [router] = useState(createScopeFollowsDigestRouter);
  return <RouterProvider router={router} />;
}
