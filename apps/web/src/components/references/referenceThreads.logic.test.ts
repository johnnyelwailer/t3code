import { expect, it } from "vite-plus/test";
import { ProjectId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";

import { makeThreadFixture, type ThreadFixtureOverrides } from "../../test-fixtures";

import { groupReferenceThreads, type ReferenceThreadRow } from "./referenceThreads.logic";

const NOW = "2026-06-01T12:00:00.000Z";
const WAKE = "2026-06-01T13:00:00.000Z";
const PAST = "2026-05-01T00:00:00.000Z";
const providerInstanceId = ProviderInstanceId.make("codex");

const runId = RunId.make("run-1");

function row(
  id: string,
  source: "linked" | "claimed" = "claimed",
  overrides: ThreadFixtureOverrides = {},
): ReferenceThreadRow {
  const shell = makeThreadFixture({
    id: ThreadId.make(id),
    projectId: ProjectId.make("project-1"),
    ...overrides,
  });
  return { ...shell, source } as ReferenceThreadRow;
}

const workingRun = {
  runId,
  status: "running" as const,
  requestedAt: null,
  startedAt: PAST,
  completedAt: null,
  assistantMessageId: null,
};

function workingRow(id: string, source: "linked" | "claimed" = "claimed"): ReferenceThreadRow {
  return row(id, source, {
    runtime: {
      status: "running",
      activeRunId: runId,
      providerInstanceId,
      providerName: null,
      lastError: null,
      updatedAt: PAST,
    },
    latestRun: workingRun,
  });
}

function sections(threads: readonly ReferenceThreadRow[]) {
  return groupReferenceThreads(threads, NOW);
}

it("groups roster rows into the sidebar's shelves in shelf order", () => {
  const result = sections([
    row("active", "claimed"),
    workingRow("working", "linked"),
    row("settled", "claimed", { settledOverride: "settled" }),
    row("snoozed", "claimed", { snoozedUntil: WAKE, snoozedAt: PAST }),
    row("pinned", "claimed", { pinnedAt: PAST }),
  ]);
  expect(result.map((section) => section.key)).toEqual([
    "pinned",
    "active",
    "working",
    "snoozed",
    "settled",
  ]);
  expect(result.map((section) => section.label)).toEqual([
    "Pinned",
    "Active",
    "Working",
    "Snoozed",
    "Settled",
  ]);
  expect(result[1]!.threads.map((thread) => thread.id)).toEqual([ThreadId.make("active")]);
  expect(result[2]!.threads.map((thread) => thread.id)).toEqual([ThreadId.make("working")]);
});

it("folds a running thread out of the active shelf into working", () => {
  const result = sections([workingRow("running-1"), row("idle-1", "claimed")]);
  const keys = result.map((section) => section.key);
  expect(keys).toEqual(["active", "working"]);
  expect(result.find((section) => section.key === "working")?.threads.map((t) => t.id)).toEqual([
    ThreadId.make("running-1"),
  ]);
  expect(result.find((section) => section.key === "active")?.threads.map((t) => t.id)).toEqual([
    ThreadId.make("idle-1"),
  ]);
});

it("lets snooze and settlement outrank a stale pin", () => {
  const snoozedThenPinned = row("a", "claimed", {
    pinnedAt: PAST,
    snoozedUntil: WAKE,
    snoozedAt: PAST,
  });
  const settledThenPinned = row("b", "claimed", {
    pinnedAt: PAST,
    settledOverride: "settled",
  });
  const result = sections([snoozedThenPinned, settledThenPinned]);
  expect(result.map((section) => section.key)).toEqual(["snoozed", "settled"]);
});

it("omits empty shelves and preserves a roster thread's source", () => {
  const linked = workingRow("linked-thread", "linked");
  const claimed = row("claimed-thread", "claimed");
  const result = sections([linked, claimed]);
  expect(result.every((section) => section.threads.length > 0)).toBe(true);
  expect(result.map((section) => section.key)).toEqual(["active", "working"]);
  expect(linked.source).toBe("linked");
  expect(claimed.source).toBe("claimed");
});

it("returns no sections for an empty roster", () => {
  expect(sections([])).toEqual([]);
});
