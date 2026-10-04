import { useState } from "react";

import {
  ProjectMyWorkDigestHeader,
  type DigestBurndownVariant,
} from "~/t3team/t3team-ProjectMyWorkDigestHeader";
import {
  ProjectMyWorkDigestToolbar,
  type DigestArrangement,
} from "~/t3team/t3team-ProjectMyWorkDigestToolbar";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import {
  ProjectMyWorkViewSwitch,
  type ProjectMyWorkLens,
} from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import { DIGEST_FIXTURE_NOW_MS, HOUR } from "~/t3team/t3team-projectMyWorkDigestFixtures";
import {
  digestFixtureAgentPlan,
  type ProjectMyWorkDigestFixtureScenario,
} from "~/t3team/t3team-projectMyWorkDigestFixtureScenarios";

export function ProjectMyWorkDigestFixtureView({
  scenario,
  nowOffsetHours = 0,
  burndownVariant = "off",
  inAppOpen = false,
}: {
  scenario: ProjectMyWorkDigestFixtureScenario;
  nowOffsetHours?: number;
  burndownVariant?: DigestBurndownVariant;
  /** Demo flag: routes row clicks through an onOpenTicket handler instead of window.open. */
  inAppOpen?: boolean;
}) {
  const [lens, setLens] = useState<ProjectMyWorkLens>("digest");
  const [arrangement, setArrangement] = useState<DigestArrangement>(scenario.arrangement);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const nowMs = DIGEST_FIXTURE_NOW_MS + nowOffsetHours * HOUR;
  const onOpenTicket = inAppOpen
    ? (ticketId: string) => {
        setOpenTicket(ticketId);
        window.setTimeout(() => setOpenTicket(null), 1600);
      }
    : undefined;
  const basePlan =
    arrangement.state === "live" || arrangement.state === "paused"
      ? arrangement.plan
      : buildHeuristicDigestPlan(scenario.graph, nowMs);
  const plan = resolveDigestPlan(basePlan, scenario.graph, nowMs);
  const start = () => {
    setArrangement({ state: "starting" });
    window.setTimeout(
      () =>
        setArrangement({
          state: "live",
          plan: { ...digestFixtureAgentPlan, producedAt: new Date(nowMs).toISOString() },
          refreshing: false,
        }),
      1200,
    );
  };
  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-7 xl:px-10 2xl:px-14">
      <div className="mx-auto w-full space-y-5 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <ProjectMyWorkViewSwitch lens={lens} onLensChange={setLens} />
          {lens === "digest" ? (
            <ProjectMyWorkDigestToolbar
              arrangement={arrangement}
              newSinceCount={plan.newSinceTicketIds.length}
              nowMs={nowMs}
              graphEmpty={scenario.graph.tickets.length === 0}
              onStart={start}
              onPause={() =>
                setArrangement((c) => (c.state === "live" ? { state: "paused", plan: c.plan } : c))
              }
              onResume={() =>
                setArrangement((c) =>
                  c.state === "paused" ? { state: "live", plan: c.plan, refreshing: false } : c,
                )
              }
            />
          ) : null}
        </div>
        {lens === "digest" ? (
          <>
            <ProjectMyWorkDigestHeader
              graph={scenario.graph}
              nowMs={nowMs}
              burndownVariant={burndownVariant}
            />
            <ProjectMyWorkDigestView
              plan={plan}
              graph={scenario.graph}
              nowMs={nowMs}
              onOpenTicket={onOpenTicket}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {lens === "hierarchy" ? "Hierarchy" : "Board"} lens: existing My Work view over the same
            graph.
          </p>
        )}
      </div>
      {openTicket ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg">
          demo: onOpenTicket("{openTicket}")
        </div>
      ) : null}
    </div>
  );
}
