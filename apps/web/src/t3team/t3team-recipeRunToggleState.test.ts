import { describe, expect, it } from "vite-plus/test";

import {
  fixtureRun,
  RUN_CONFIG_WARNING,
  RUN_FAILED,
  RUN_NEEDS_YOU,
  RUN_OFF,
  RUN_QUIET,
  RUN_SIGN_IN,
  RUN_STARTING,
  WATCHER_412_FIXING,
  WATCHER_412_NEEDS_YOU,
} from "~/t3team/t3team-prWatchFixtures";

import { resolveRunCounts, resolveRunToggleState } from "./t3team-recipeRunToggleState";

const NOW = Date.parse("2026-10-08T09:30:00.000Z");
const OFF = "Off · babysits every open PR you wrote or review, on Nexplore Conductor";
const resolve = (
  run: Parameters<typeof resolveRunToggleState>[0]["run"],
  pending: "starting" | "stopping" | null = null,
) => resolveRunToggleState({ run, pending, offDescription: OFF, nowMs: NOW });
const lineText = (state: ReturnType<typeof resolve>) =>
  state.line.map((part) => part.text).join(" · ");

describe("resolveRunToggleState", () => {
  it("is off with the off wording when there is no run", () => {
    const state = resolve(RUN_OFF);
    expect(state.kind).toBe("off");
    expect(state.checked).toBe(false);
    expect(state.dot).toBe("muted");
    expect(lineText(state)).toBe(`Off · ${OFF}`);
  });

  it("shows starting with the run's live label while the first pass runs", () => {
    const state = resolve(RUN_STARTING);
    expect(state.kind).toBe("starting");
    expect(state.busy).toBe(true);
    expect(state.pulse).toBe(true);
    expect(lineText(state)).toBe("Starting · finding your PRs on 3 repos…");
  });

  it("shows starting on the local marker before the launch fact lands", () => {
    expect(resolve(RUN_OFF, "starting").kind).toBe("starting");
  });

  it("is quiet with the model and machine when nothing needs anyone", () => {
    const state = resolve(RUN_QUIET);
    expect(state.kind).toBe("on");
    expect(state.dot).toBe("emerald");
    expect(lineText(state)).toBe("12 PRs watched · all quiet · Conductor · this Mac");
  });

  it("counts need you, fixing and parked live from the watch threads", () => {
    const state = resolve(RUN_NEEDS_YOU);
    expect(state.dot).toBe("indigo");
    expect(lineText(state)).toBe("12 PRs watched · 2 need you · 1 fixing · 1 parked");
    expect(state.line[1]).toMatchObject({ kind: "count", bucket: "needs-you", emphasis: true });
  });

  it("lets a docked question outrank a stale summary count", () => {
    const run = fixtureRun({
      status: "sleeping",
      summary: { counts: [{ id: "needs-you", label: "need you", value: 0 }] },
      watchThreads: [WATCHER_412_NEEDS_YOU],
    });
    expect(resolveRunCounts(run)["needs-you"]).toBe(1);
  });

  it("falls back to the summary counts while no watch thread is visible", () => {
    const run = fixtureRun({
      status: "sleeping",
      summary: {
        counts: [
          { id: "needs-you", label: "need you", value: 3 },
          { id: "fixing", label: "fixing", value: 1 },
        ],
      },
    });
    expect(resolveRunCounts(run)).toMatchObject({ "needs-you": 3, fixing: 1, watched: 12 });
  });

  it("goes amber with the warnings when the summary carries any", () => {
    expect(resolve(RUN_CONFIG_WARNING).dot).toBe("amber");
    expect(resolve(RUN_CONFIG_WARNING).warnings[0]?.kind).toBe("config");
    const signIn = resolve(RUN_SIGN_IN);
    expect(lineText(signIn)).toBe("4 PRs watched · 8 unreadable");
    expect(signIn.warnings[0]?.kind).toBe("sign-in");
  });

  it("reads a failed run as still watching, with the failure age and a retry", () => {
    const state = resolve(RUN_FAILED);
    expect(state.kind).toBe("failed");
    expect(state.dot).toBe("red");
    expect(state.checked).toBe(true);
    expect(lineText(state)).toBe("12 PRs still watched · discovery failed 9 min ago");
  });

  it("keeps the switch on and busy while stopping", () => {
    const state = resolve(
      fixtureRun({ status: "sleeping", watchThreads: [WATCHER_412_FIXING] }),
      "stopping",
    );
    expect(state.busy).toBe(true);
    expect(state.checked).toBe(true);
  });
});
