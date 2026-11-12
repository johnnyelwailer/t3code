/**
 * Which params a trigger's source is bound with, the feature-flag gate, and the reconcile's
 * handling of a scope change (the old instance's registration must go, or it keeps polling).
 */
import {
  clearPackFeatureFlags,
  registerPackFeatureFlags,
  replaceFeatureFlagPresetValues,
} from "@t3tools/project-context/t3teamFeatureFlags";
import {
  ScmProjectItems,
  ScmProjectItemUpdated,
  ScmViewerChangeRequests,
  ScmViewerChangeRequestUpdated,
  type RecipeTriggerSpec,
} from "@t3team/sdk";
import { describe, expect, it } from "@effect/vitest";

import { reconcileRecipeTriggerRegistrations } from "./t3team-recipeTriggerReconcile.ts";
import type { RecipeTriggerSetting } from "./t3team-recipeTriggerSettings.ts";
import { recipeTriggerFlagAllows, triggerSourceParams } from "./t3team-recipeTriggerSources.ts";

const projectTrigger = (over: Partial<RecipeTriggerSpec> = {}): RecipeTriggerSpec => ({
  id: "ghe",
  source: ScmProjectItems,
  signal: ScmProjectItemUpdated,
  select: () => ({}),
  key: () => "k",
  defaultEnabled: true,
  scope: { query: "is:issue" },
  ...over,
});

describe("triggerSourceParams", () => {
  it("binds the project, with the setting's query over the author's", () => {
    expect(triggerSourceParams(projectTrigger(), "p1", undefined)).toEqual({
      projectId: "p1",
      query: "is:issue",
    });
    expect(
      triggerSourceParams(projectTrigger(), "p1", { scope: { query: " label:bug " } }),
    ).toEqual({ projectId: "p1", query: "label:bug" });
    expect(triggerSourceParams(projectTrigger({ scope: {} }), "p1", undefined)).toEqual({
      projectId: "p1",
    });
  });

  it("never passes a query to the viewer source", () => {
    const viewer = projectTrigger({
      source: ScmViewerChangeRequests,
      signal: ScmViewerChangeRequestUpdated,
    });
    expect(triggerSourceParams(viewer, "p1", undefined)).toEqual({ projectId: "p1" });
  });
});

describe("recipeTriggerFlagAllows", () => {
  it("runs ungated triggers, and gated ones only while their flag is on", () => {
    clearPackFeatureFlags();
    replaceFeatureFlagPresetValues(new Map());
    try {
      expect(recipeTriggerFlagAllows(projectTrigger())).toBe(true);
      const gated = projectTrigger({ featureFlag: "recipes.project-triage" });
      expect(recipeTriggerFlagAllows(gated)).toBe(false); // unknown flag: off
      registerPackFeatureFlags([
        {
          key: "recipes.project-triage",
          group: "Orchestration",
          label: "Project triage",
          description: "test",
          defaultEnabled: false,
          requiresRestart: false,
        },
      ]);
      expect(recipeTriggerFlagAllows(gated)).toBe(false);
      replaceFeatureFlagPresetValues(new Map([["recipes.project-triage", true]]));
      expect(recipeTriggerFlagAllows(gated)).toBe(true);
    } finally {
      clearPackFeatureFlags();
      replaceFeatureFlagPresetValues(new Map());
    }
  });
});

describe("reconcileRecipeTriggerRegistrations", () => {
  it("replaces the registration when the scope changes, so the old instance stops", async () => {
    // Only the fields the reconcile reads; a real recipe.ts needs its workflow file on disk.
    const recipe = { kind: "recipe", triggers: [projectTrigger()] } as never;
    const rows: Array<{ runId: string; sourceName: string; paramsHash: string; params: unknown }> =
      [];
    let setting: RecipeTriggerSetting = {};
    const run = () =>
      reconcileRecipeTriggerRegistrations({
        projects: [{ projectId: "p1", workspaceRoot: "/w", defaultModelSelection: null }],
        store: {
          upsertRegistration: async (input) => {
            if (!rows.some((r) => r.runId === input.runId && r.paramsHash === input.paramsHash)) {
              rows.push(input);
            }
          },
          deleteRegistration: async (input) => {
            const at = rows.findIndex(
              (r) => r.runId === input.owner && r.paramsHash === input.paramsHash,
            );
            if (at >= 0) rows.splice(at, 1);
          },
          listTriggerRegistrations: async () => [...rows],
        },
        readSettings: async () => ({ "triage:ghe": setting }),
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
        importRecipeRef: async () => recipe,
        log: () => {},
      });

    await run();
    expect(rows.map((r) => r.params)).toEqual([{ projectId: "p1", query: "is:issue" }]);
    setting = { scope: { query: "is:pr" } };
    const live = await run();
    expect(rows.map((r) => r.params)).toEqual([{ projectId: "p1", query: "is:pr" }]);
    expect(live.map((t) => t.instance.paramsHash)).toEqual([rows[0]!.paramsHash]);
  });
});
