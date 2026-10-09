import { describe, expect, it } from "vite-plus/test";

import { fixtureLink } from "~/t3team/t3team-prWatchFixtures";

import { ENV, facts, PROJECT, shell } from "./t3team-prWatchShellFixtures";
import { collectRecipeRun, isRunActive } from "./t3team-recipeRun.logic";

const scope = { environmentId: ENV, projectId: PROJECT, recipeId: "pr-watch" };
const LAUNCH_FACT = {
  id: "pr-watch",
  version: "1.0.0",
  runId: "run-1",
  action: null,
  launchedAt: "2026-10-08T08:00:00.000Z",
};
const launchedBy = (scopeName: string, launchThreadId = "home") => ({
  "t3team.launchedBy": {
    runId: "run-1",
    launchThreadId,
    scope: scopeName,
    key: "pr:nexplore.ghe.com/hive/nx-nexi#412",
    launchedAt: "2026-10-08T08:00:00.000Z",
  },
});
const SUMMARY = {
  counts: [{ id: "watched", label: "PRs watched", value: 12 }],
  warnings: [],
  updatedAt: "2026-10-08T09:00:00.000Z",
};
const launch = (status: "sleeping" | "failed" | "completed", summary?: unknown) => ({
  workflowRunStatus: {
    runId: `run-${status}`,
    status,
    pendingKind: null,
    wakeAt: null,
    updatedAt: "2026-10-08T09:00:00.000Z",
  } as const,
  extensions: {
    "t3team.recipe": LAUNCH_FACT,
    ...(summary ? { "nexplore.pr-watch.summary": summary } : {}),
  },
});

describe("collectRecipeRun", () => {
  it("finds the home thread by the launch fact and reads its summary and live label", () => {
    const run = collectRecipeRun(
      [shell({ id: "home" }), shell({ id: "other" })],
      new Map([facts("home", { ...launch("sleeping", SUMMARY), activityLabel: "pass 3" })]),
      scope,
    );
    expect(run.home?.threadRef.threadId).toBe("home");
    expect(run.home?.summary?.counts[0]?.value).toBe(12);
    expect(run.home?.activityLabel).toBe("pass 3");
    expect(isRunActive(run.home?.workflowRunStatus)).toBe(true);
  });

  it("reads a summary that does not decode as no summary", () => {
    const run = collectRecipeRun(
      [shell({ id: "home" })],
      new Map([facts("home", launch("sleeping", { watched: 12 }))]),
      scope,
    );
    expect(run.home?.summary).toBeNull();
  });

  it("prefers an active run over a finished one regardless of age", () => {
    const run = collectRecipeRun(
      [
        shell({ id: "old", updatedAt: "2026-10-01T00:00:00.000Z" }),
        shell({ id: "new", updatedAt: "2026-10-08T00:00:00.000Z" }),
      ],
      new Map([facts("old", launch("sleeping")), facts("new", launch("completed"))]),
      scope,
    );
    expect(run.home?.threadRef.threadId).toBe("old");
  });

  it("ignores another recipe's run and another project's threads", () => {
    const run = collectRecipeRun(
      [shell({ id: "foreign" }), shell({ id: "elsewhere", projectId: "project-b" as never })],
      new Map([
        facts("foreign", {
          extensions: { "t3team.recipe": { ...LAUNCH_FACT, id: "arrange-my-work" } },
        }),
        facts("elsewhere", launch("sleeping")),
      ]),
      scope,
    );
    expect(run.home).toBeNull();
  });

  it("collects the threads the recipe's run launched, with their current link", () => {
    const link = fixtureLink({ repository: "hive/nx-nexi", number: 412, title: "Scope filter" });
    const run = collectRecipeRun(
      [
        shell({ id: "home" }),
        shell({ id: "w412", pullRequests: [link], hasPendingUserInput: true }),
        shell({ id: "nolink" }),
        shell({ id: "other-recipe", pullRequests: [link] }),
        shell({ id: "plain", pullRequests: [link] }),
      ],
      new Map([
        facts("home", launch("sleeping")),
        facts("w412", { extensions: launchedBy("recipe:pr-watch") }),
        facts("nolink", { extensions: launchedBy("recipe:pr-watch") }),
        facts("other-recipe", {
          extensions: launchedBy("recipe:arrange-my-work", "other-home"),
        }),
      ]),
      scope,
    );
    expect(run.watchThreads.map((w) => w.threadRef.threadId)).toEqual(["w412"]);
    expect(run.watchThreads[0]?.hasPendingUserInput).toBe(true);
    expect(run.watchThreads[0]?.recipeId).toBe("pr-watch");
  });

  it("also takes a thread whose launch thread is the home, whatever its scope says", () => {
    const link = fixtureLink({ repository: "hive/nx-nexi", number: 412, title: "Scope filter" });
    const run = collectRecipeRun(
      [shell({ id: "home" }), shell({ id: "adopted", pullRequests: [link] })],
      new Map([
        facts("home", launch("sleeping")),
        facts("adopted", { extensions: launchedBy("run:run-1", "home") }),
      ]),
      scope,
    );
    expect(run.watchThreads.map((w) => w.threadRef.threadId)).toEqual(["adopted"]);
  });
});
