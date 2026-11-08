import {
  ScmProjectItems,
  ScmProjectItemUpdated,
  resolveSignalSourceParams,
  signalInstanceKey,
  WorkItemProjectUpdates,
  WorkItemUpdated,
  type RecipeTriggerSpec,
} from "@t3team/sdk";
import { describe, expect, it } from "@effect/vitest";

import { readRecipeTriggerStatus } from "./t3team-recipeTriggerStatus.ts";

const trigger = (over: Partial<RecipeTriggerSpec>): RecipeTriggerSpec => ({
  id: "ghe",
  source: ScmProjectItems,
  signal: ScmProjectItemUpdated,
  select: () => ({}),
  key: () => "k",
  defaultEnabled: true,
  ...over,
});

describe("readRecipeTriggerStatus", () => {
  it("reports each trigger's state, scope, instance health, cursor, backlog and last launch", async () => {
    const { paramsHash } = await resolveSignalSourceParams(ScmProjectItems, {
      projectId: "p1",
      query: "is:issue",
    });
    const instanceKey = signalInstanceKey("scm.project.items", paramsHash);
    const cursorKeys: string[] = [];
    const rows = await readRecipeTriggerStatus({
      projects: [{ projectId: "p1", workspaceRoot: "/w", defaultModelSelection: null }],
      readSettings: async () => ({ "triage:jira": { enabled: false } }),
      listRecipes: async () => ({
        recipes: [
          {
            id: "triage",
            authoring: "recipe-ts",
            recipePath: "/w/recipes/triage",
            workflowPath: "/w/recipes/triage/triage.workflow.ts",
          } as never,
        ],
      }),
      // Only the fields the reconcile reads; a real recipe.ts needs its workflow file on disk.
      importRecipeRef: async () =>
        ({
          kind: "recipe",
          triggers: [
            trigger({ scope: { query: "is:issue" } }),
            trigger({ id: "jira", source: WorkItemProjectUpdates, signal: WorkItemUpdated }),
            trigger({ id: "gated", featureFlag: "recipes.not-registered" }),
          ],
        }) as never,
      cursorUpdatedAt: async (key) => {
        cursorKeys.push(key);
        return "2026-10-23T10:00:00.000Z";
      },
      inboxSummary: async () => ({ lastEventAt: "2026-10-23T10:01:00.000Z", undelivered: 2 }),
      lastLaunch: async () => ({
        launchId: "run-1",
        projectId: "p1",
        recipeId: "triage",
        triggerId: "ghe",
        key: "k",
        args: {},
        status: "pending",
        attempts: 2,
        lastError: "workflow file missing",
        claimedAt: "2026-10-23T10:02:00.000Z",
        launchedAt: null,
      }),
      instances: () => [
        {
          instanceKey,
          state: "running",
          health: { lastPollAt: "2026-10-23T10:03:00.000Z", lastError: "search refused" },
        },
      ],
    });

    expect(rows.map((row) => [row.triggerId, row.state])).toEqual([
      ["ghe", "active"],
      ["jira", "disabled"],
      ["gated", "feature-flag-off"],
    ]);
    expect(rows[0]).toMatchObject({
      sourceName: "scm.project.items",
      scope: { projectId: "p1", query: "is:issue" },
      cursorUpdatedAt: "2026-10-23T10:00:00.000Z",
      lastEventAt: "2026-10-23T10:01:00.000Z",
      undelivered: 2,
      lastLaunch: { runId: "run-1", status: "pending", attempts: 2 },
    });
    expect(rows[0]?.instance).toEqual({
      state: "running",
      lastPollAt: "2026-10-23T10:03:00.000Z",
      lastError: "search refused",
    });
    // The cursor is read under the same instance key the reconciler runs it as.
    expect(cursorKeys).toEqual([instanceKey]);
  });

  it("says when a desired instance is not running in this process", async () => {
    const [row] = await readRecipeTriggerStatus({
      projects: [{ projectId: "p1", workspaceRoot: "/w", defaultModelSelection: null }],
      readSettings: async () => ({}),
      listRecipes: async () => ({
        recipes: [
          {
            id: "triage",
            authoring: "recipe-ts",
            recipePath: "/w/r",
            workflowPath: "/w/r/w.workflow.ts",
          } as never,
        ],
      }),
      importRecipeRef: async () => ({ kind: "recipe", triggers: [trigger({})] }) as never,
      cursorUpdatedAt: async () => null,
      inboxSummary: async () => ({ lastEventAt: null, undelivered: 0 }),
      lastLaunch: async () => undefined,
      instances: () => [],
    });
    expect(row?.instance).toEqual({
      state: "not-running",
      lastPollAt: undefined,
      lastError: undefined,
    });
    expect(row).not.toHaveProperty("lastLaunch");
  });
});
