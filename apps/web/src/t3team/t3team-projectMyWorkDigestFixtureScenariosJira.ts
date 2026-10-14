import { ago, digestFixtureGraph } from "~/t3team/t3team-projectMyWorkDigestFixtures";
import {
  emptyGraphScenario,
  type ProjectMyWorkDigestFixtureScenario,
} from "~/t3team/t3team-projectMyWorkDigestFixtureScenarios";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

const WEEKS_AGO = 26 * 24;

const withJiraState = (
  scenario: ProjectMyWorkDigestFixtureScenario,
  jira: Partial<DigestGraph>,
): ProjectMyWorkDigestFixtureScenario => ({
  ...scenario,
  graph: { ...scenario.graph, ...jira },
});

const heuristic: ProjectMyWorkDigestFixtureScenario = {
  graph: digestFixtureGraph,
  arrangement: { state: "off" },
};

/** The mirror stopped refreshing weeks ago and nothing has said so. */
export const staleJiraSyncScenario = withJiraState(heuristic, { jiraSyncedAt: ago(WEEKS_AGO) });

/** The refresh grant was rejected: the data below is the last good read. */
export const jiraSessionExpiredScenario = withJiraState(heuristic, {
  jiraAuth: "needs-reconnect",
  jiraSyncedAt: ago(WEEKS_AGO),
});

/** A dead session over an empty read must not claim that nothing needs the user. */
export const jiraSessionExpiredEmptyScenario = withJiraState(emptyGraphScenario, {
  jiraAuth: "needs-reconnect",
  jiraSyncedAt: ago(WEEKS_AGO),
});

/** The first sync after connecting is still walking the project: no sync time to show yet. */
export const jiraSyncInProgressScenario = withJiraState(heuristic, {
  jiraAuth: "ok",
  jiraSyncPending: true,
});

/** The same first sync, before any of the viewer's tickets have landed in the mirror. */
export const jiraSyncInProgressEmptyScenario = withJiraState(emptyGraphScenario, {
  jiraAuth: "ok",
  jiraSyncPending: true,
});

export const jiraSyncFailedScenario = withJiraState(heuristic, {
  jiraAuth: "ok",
  jiraSyncedAt: ago(30),
  jiraSyncError: "Couldn't reach Jira; retrying automatically.",
});
