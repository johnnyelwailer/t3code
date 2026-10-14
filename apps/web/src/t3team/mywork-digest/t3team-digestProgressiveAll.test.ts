import { describe, expect, it, vi } from "vite-plus/test";

import type {
  MyWorkDigestPayload,
  MyWorkDigestPollFn,
  MyWorkDigestProjectInput,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  mergeProgressiveParts,
  orderProgressiveEntries,
  runProgressiveAllRounds,
} from "./t3team-digestProgressiveAll";

const entry = (key: string): MyWorkDigestProjectInput => ({
  account: { id: "acc", provider: "atlassian" },
  externalProjectId: key,
  appProjectId: `app-${key}`,
  name: key,
});

const payloadFor = (
  key: string,
  extra: Partial<MyWorkDigestPayload> = {},
): MyWorkDigestPayload => ({
  scope: "all",
  projects: [
    {
      project: { id: key, name: key },
      tickets: [{ id: `${key}-1`, displayId: `${key}-1` }],
      claims: [],
      decisions: [],
      changeRequests: [],
      transitions: [],
    } as unknown as MyWorkDigestPayload["projects"][number],
  ],
  viewer: { name: "Phil J" },
  ...extra,
});

describe("orderProgressiveEntries", () => {
  it("puts the projects with work on screen first, keeping order otherwise", () => {
    const previous = {
      tickets: [{ projectId: "app-IES" }, { projectId: "app-IES" }, { projectId: "app-PW" }],
    } as unknown as DigestGraph;
    const ordered = orderProgressiveEntries([entry("A"), entry("PW"), entry("IES")], previous);
    expect(ordered.map((e) => e.externalProjectId)).toEqual(["IES", "PW", "A"]);
    expect(
      orderProgressiveEntries([entry("A"), entry("B")], null).map((e) => e.externalProjectId),
    ).toEqual(["A", "B"]);
  });
});

describe("mergeProgressiveParts", () => {
  it("aligns entries with the projects that loaded and skips empty answers", () => {
    const merged = mergeProgressiveParts([
      { entry: entry("IES"), payload: payloadFor("IES") },
      { entry: entry("GONE"), payload: { scope: "all", projects: [] } },
      {
        entry: entry("PW"),
        payload: payloadFor("PW", { changeRequestsPending: true, viewer: { unresolved: true } }),
      },
    ]);
    expect(merged.payload.projects.map((p) => p.project.id)).toEqual(["IES", "PW"]);
    expect(merged.entries.map((e) => e.externalProjectId)).toEqual(["IES", "PW"]);
    expect(merged.payload.viewer).toEqual({ name: "Phil J", unresolved: true });
    expect(merged.payload.changeRequestsPending).toBe(true);
  });
});

describe("runProgressiveAllRounds", () => {
  it("asks one project at a time as scope all and reports what is still to come", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const pollFn = vi.fn<MyWorkDigestPollFn>(async (input) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      const key = input.projects[0]?.externalProjectId ?? "";
      if (key === "BAD") throw new Error("timeout");
      return { unchanged: false, fingerprint: key, value: payloadFor(key) };
    });
    const landed: Array<[string, string[]]> = [];
    const skipped: string[] = [];
    await runProgressiveAllRounds({
      entries: [entry("IES"), entry("BAD"), entry("PW")],
      pollFn,
      viewerName: "Phil J",
      timeZone: "Europe/Zurich",
      isCancelled: () => false,
      onPart: (part, remaining) =>
        landed.push([part.entry.externalProjectId, remaining.map((e) => e.externalProjectId)]),
      onSkip: (skippedEntry) => skipped.push(skippedEntry.externalProjectId),
    });
    expect(maxInFlight).toBe(1);
    expect(
      pollFn.mock.calls.every(([input]) => input.scope === "all" && input.projects.length === 1),
    ).toBe(true);
    expect(landed).toEqual([
      ["IES", ["BAD", "PW"]],
      ["PW", []],
    ]);
    expect(skipped).toEqual(["BAD"]);
  });

  it("stops as soon as it is cancelled (the all-scope round landed)", async () => {
    let cancelled = false;
    const pollFn = vi.fn<MyWorkDigestPollFn>(async (input) => {
      const key = input.projects[0]?.externalProjectId ?? "";
      return { unchanged: false, fingerprint: key, value: payloadFor(key) };
    });
    const landed: string[] = [];
    await runProgressiveAllRounds({
      entries: [entry("IES"), entry("PW"), entry("X")],
      pollFn,
      viewerName: "",
      timeZone: "UTC",
      isCancelled: () => cancelled,
      onPart: (part) => {
        landed.push(part.entry.externalProjectId);
        cancelled = true;
      },
    });
    expect(landed).toEqual(["IES"]);
    expect(pollFn).toHaveBeenCalledTimes(1);
  });
});
