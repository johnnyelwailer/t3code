import { describe, expect, it } from "vite-plus/test";

import {
  BACKGROUND_JOB_DEADLINE_GRACE_MS,
  backgroundJobFinishSignals,
  backgroundJobsSummaryLabel,
  detectBackgroundJobStart,
  foldBackgroundJobs,
  runningBackgroundJobs,
  type BackgroundJobFoldEntry,
} from "./backgroundJobs.js";

const T0 = Date.parse("2026-09-11T12:00:00.000Z");
const T0_ISO = "2026-09-11T12:00:00.000Z";
const T0_PLUS_10S = "2026-09-11T12:00:10.000Z";
const T0_PLUS_30S = "2026-09-11T12:00:30.000Z";
const T0_PLUS_40S = "2026-09-11T12:00:40.000Z";

const startDetail =
  "Command still running after 10s — it is now a background job: job_a1b2c3d4 (pid 4242). " +
  "It keeps running under a 600s hard deadline owned by this thread; you do not have to wait for it. " +
  "Completion notifies you automatically — do not start a duplicate. " +
  'Inspect with process({action: "peek", id: "job_a1b2c3d4"}), list with process({action: "list"}), ' +
  'stop it with process({action: "kill", id: "job_a1b2c3d4"}).';

const entry = (
  overrides: Partial<BackgroundJobFoldEntry> & { id: string },
): BackgroundJobFoldEntry => ({
  id: overrides.id,
  createdAt: overrides.createdAt ?? T0_ISO,
  detail: overrides.detail,
});

describe("detectBackgroundJobStart", () => {
  it("parses id, start and hard deadline from the yield marker", () => {
    const start = detectBackgroundJobStart(startDetail, T0 + 10_000);
    expect(start).toEqual({
      jobId: "job_a1b2c3d4",
      startedAtMs: T0,
      deadlineMs: T0 + 600_000,
    });
  });

  it("returns null for ordinary tool results", () => {
    expect(detectBackgroundJobStart("total 0\n(empty)", T0)).toBeNull();
    expect(detectBackgroundJobStart("", T0)).toBeNull();
    expect(detectBackgroundJobStart("background jobs are a great idea", T0)).toBeNull();
  });

  it("clamps the start when the reported elapsed exceeds the observed time", () => {
    const start = detectBackgroundJobStart(startDetail, 5_000)!;
    expect(start.startedAtMs).toBe(0);
    expect(start.deadlineMs).toBe(600_000);
  });
});

describe("backgroundJobFinishSignals", () => {
  it("settles jobs named by the process list", () => {
    const list =
      "3 job(s):\njob_a1b2c3d4  running (12.3s elapsed)  sleep 30\n" +
      "job_beef0001  completed (exit 0, 30s)  build\n" +
      "job_beef0002  failed (exit 1, 9s)  test\n" +
      "job_beef0003  killed at its deadline (601s)  watch\n" +
      "job_beef0004  cancelled  halt";
    expect(backgroundJobFinishSignals(list)).toEqual(
      new Map([
        ["job_beef0001", "finished"],
        ["job_beef0002", "finished"],
        ["job_beef0003", "killed-deadline"],
        ["job_beef0004", "cancelled"],
      ]),
    );
  });

  it("treats a running list row as no signal at all", () => {
    expect(
      backgroundJobFinishSignals("1 job(s):\njob_a1b2c3d4  running (5s elapsed)  sleep 30"),
    ).toEqual(new Map());
  });

  it("settles from the peek tail and the kill receipt", () => {
    expect(backgroundJobFinishSignals("some output\n[job job_a1b2c3d4 finished]")).toEqual(
      new Map([["job_a1b2c3d4", "finished"]]),
    );
    expect(
      backgroundJobFinishSignals(
        "Kill requested for job_a1b2c3d4; it will be reported as cancelled. Any completion notice for it is suppressed.",
      ),
    ).toEqual(new Map([["job_a1b2c3d4", "cancelled"]]));
  });

  it("settles from the completion notice sentence", () => {
    expect(
      backgroundJobFinishSignals(
        'Background job job_a1b2c3d4 (sleep 30) is completed (exit 0, 30s). Read its output with process({action: "peek", id: "job_a1b2c3d4"}).',
      ),
    ).toEqual(new Map([["job_a1b2c3d4", "finished"]]));
  });

  it("ignores plain command text that merely contains the prefix", () => {
    expect(backgroundJobFinishSignals("echo 'job_a1b2c3d4 running' && true")).toEqual(new Map());
  });

  it("never treats the start marker itself as a settle", () => {
    expect(backgroundJobFinishSignals(startDetail)).toEqual(new Map());
  });
});

describe("foldBackgroundJobs", () => {
  it("opens a job on the start marker and settles it on a later process result", () => {
    const entries = [
      entry({ id: "e1", detail: startDetail }),
      entry({
        id: "e2",
        createdAt: T0_PLUS_30S,
        detail: "1 job(s):\njob_a1b2c3d4  running (30s elapsed)  sleep 30",
      }),
      entry({
        id: "e3",
        createdAt: T0_PLUS_40S,
        detail: "output…\n[job job_a1b2c3d4 finished]",
      }),
    ];
    const jobs = foldBackgroundJobs(entries, T0 + 60_000);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      jobId: "job_a1b2c3d4",
      state: "finished",
      finishedReason: "finished",
      startedEntryId: "e1",
      lastSeenEntryId: "e3",
    });
  });

  it("keeps the job running while only start + running markers exist", () => {
    const jobs = foldBackgroundJobs([entry({ id: "e1", detail: startDetail })], T0 + 60_000);
    expect(jobs[0]).toMatchObject({ jobId: "job_a1b2c3d4", state: "running" });
    expect(jobs[0]?.startedEntryId).toBe("e1");
    expect(jobs[0]?.lastSeenEntryId).toBe("e1");
  });

  it("dedupes repeated start markers for the same job", () => {
    const jobs = foldBackgroundJobs(
      [entry({ id: "e1", detail: startDetail }), entry({ id: "e2", detail: startDetail })],
      T0 + 10_000,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.startedEntryId).toBe("e1");
    expect(jobs[0]?.lastSeenEntryId).toBe("e2");
  });

  it("settles a job that only appears via a terminal marker", () => {
    const jobs = foldBackgroundJobs(
      [
        entry({
          id: "e1",
          detail: "Kill requested for job_zz99; it will be reported as cancelled.",
        }),
      ],
      T0,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      jobId: "job_zz99",
      state: "finished",
      finishedReason: "cancelled",
    });
  });

  it("keeps finished sticky when a later start marker repeats", () => {
    const jobs = foldBackgroundJobs(
      [
        entry({ id: "e1", detail: startDetail }),
        entry({ id: "e2", detail: "[job job_a1b2c3d4 finished]" }),
        entry({ id: "e3", detail: startDetail }),
      ],
      T0 + 10_000,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.state).toBe("finished");
  });

  it("ignores entries without detail", () => {
    expect(foldBackgroundJobs([entry({ id: "e1" })], T0)).toEqual([]);
  });
});

describe("runningBackgroundJobs", () => {
  const fold = (detail: string, atMs: number) =>
    foldBackgroundJobs([{ id: "e1", createdAt: T0_PLUS_10S, detail }], atMs);

  it("returns running jobs inside their hard deadline", () => {
    const jobs = runningBackgroundJobs(fold(startDetail, T0 + 10_000), T0 + 100_000);
    expect(jobs).toHaveLength(1);
  });

  it("excludes running jobs past deadline + grace (stale transcripts self-clear)", () => {
    const jobs = runningBackgroundJobs(
      fold(startDetail, T0 + 10_000),
      T0 + 600_000 + BACKGROUND_JOB_DEADLINE_GRACE_MS + 1,
    );
    expect(jobs).toEqual([]);
  });

  it("excludes finished jobs even inside the deadline", () => {
    const jobs = runningBackgroundJobs(
      foldBackgroundJobs(
        [
          entry({ id: "e1", detail: startDetail }),
          entry({ id: "e2", detail: "[job job_a1b2c3d4 finished]" }),
        ],
        T0 + 10_000,
      ),
      T0 + 100_000,
    );
    expect(jobs).toEqual([]);
  });
});

describe("backgroundJobsSummaryLabel", () => {
  const oneJob = (startedAtMs: number) => ({
    jobId: "job_a",
    startedAtMs,
    deadlineMs: startedAtMs + 600_000,
    state: "running" as const,
  });

  it("formats seconds under a minute", () => {
    expect(backgroundJobsSummaryLabel([oneJob(T0 + 40_000)], T0 + 45_000)).toBe(
      "1 background job running · 5s",
    );
  });

  it("pluralizes and uses the oldest job's age (not the newest)", () => {
    // Oldest started 100s ago, newest 70s ago — the label must use 100s.
    expect(
      backgroundJobsSummaryLabel([oneJob(T0 + 60_000), oneJob(T0 + 30_000)], T0 + 130_000),
    ).toBe("2 background jobs running · 1m 40s");
  });

  it("formats hours", () => {
    expect(backgroundJobsSummaryLabel([oneJob(T0)], T0 + 3_605_000)).toBe(
      "1 background job running · 1h 5s",
    );
  });

  it("is null when nothing is running", () => {
    expect(backgroundJobsSummaryLabel([], T0)).toBeNull();
  });
});
