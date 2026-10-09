import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import type { DigestGraph, DigestYesterdayMerged } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  DIGEST_FIXTURE_NOW_MS,
  HOUR,
  P,
  ago,
  digestFixtureGraph,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";
import type { ProjectMyWorkDigestFixtureScenario } from "~/t3team/t3team-projectMyWorkDigestFixtureScenarios";

const ticket = (id: string, key: string, title: string, status: string): ProjectTicket =>
  createTicket({
    id,
    projectId: P,
    issueType: "Sub-task",
    status,
    assignee: "Philip",
    updatedAt: ago(18),
    ref: { displayId: key, title },
  });

// The product owner's own previous working day: one library bump merged in three repos, a review
// finished, a ticket handed to test, a time-logging move, and a Jira edit that says nothing.
const yesterdayTickets: readonly ProjectTicket[] = [
  ticket("y-bump", "IES-25144", "Bump ies-base-libs to 4.2 in all frontends", "Done"),
  ticket("y-koord", "IES-23704", "FE Koordination: Einsatzübersicht Filter", "Done"),
  ticket("y-alarm", "IES-24744", "Alarmierung: Rückmeldungen gruppieren", "In Test"),
  ticket("y-time", "IES-23705", "FE Koordination: Zeiterfassung", "Time Logging"),
  ticket("y-upd", "IES-24571", "Ressourcen Detail: Beschriftungen", "In Progress"),
];

const merged = (
  repo: string,
  number: number,
  title: string,
  hoursAgo: number,
  key?: string,
): DigestYesterdayMerged => ({
  id: `github.com:hive/${repo}#${number}`,
  projectId: P,
  host: "github.com",
  repo: `hive/${repo}`,
  number,
  title,
  mergedAt: ago(hoursAgo),
  ...(key ? { workItemKey: key, ticketId: "y-bump" } : {}),
});

const yesterdayGraph: DigestGraph = {
  ...digestFixtureGraph,
  tickets: [...digestFixtureGraph.tickets, ...yesterdayTickets],
  yesterday: {
    merged: [
      merged("ies-alarm", 399, "IES-25144 Bump ies-base-libs to 4.2", 22, "IES-25144"),
      merged("ies-psd", 241, "IES-25144 Bump ies-base-libs to 4.2", 21.5, "IES-25144"),
      merged("ies-koordination", 851, "IES-25144 Bump ies-base-libs to 4.2", 21, "IES-25144"),
      merged("ies-base-libs", 112, "chore: renovate lockfile maintenance", 23),
    ],
    moved: [
      { ticketId: "y-koord", from: "Code Review", to: "Done", at: ago(19) },
      { ticketId: "y-alarm", from: "Code Review", to: "In Test", at: ago(20) },
      { ticketId: "y-time", from: "To Do", to: "Time Logging", at: ago(24) },
      { ticketId: "y-upd", at: ago(18) },
    ],
  },
};

export const yesterdayRecapScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: yesterdayGraph,
  arrangement: { state: "off" },
};

/**
 * The story arg that puts the fixture clock at `hour` local time, whatever zone the browser runs
 * in: the Yesterday placement follows the viewer's own morning.
 */
export function digestFixtureOffsetToLocalHour(hour: number): number {
  const fixtureNow = new Date(DIGEST_FIXTURE_NOW_MS);
  const target = new Date(fixtureNow);
  target.setHours(hour, 0, 0, 0);
  return (target.getTime() - DIGEST_FIXTURE_NOW_MS) / HOUR;
}
