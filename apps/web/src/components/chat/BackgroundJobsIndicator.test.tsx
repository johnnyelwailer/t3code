import type { BackgroundJobState } from "@t3tools/client-runtime/work-log/background-jobs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  BackgroundJobList,
  BackgroundJobRunningBadge,
  BackgroundJobsRunningIndicator,
} from "./BackgroundJobsIndicator";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
vi.setSystemTime(NOW);

const job = (
  overrides: Partial<BackgroundJobState> & Pick<BackgroundJobState, "jobId">,
): BackgroundJobState => ({
  startedAtMs: NOW - 45_000,
  deadlineMs: NOW + 555_000,
  state: "running",
  ...overrides,
});

describe("BackgroundJobsRunningIndicator", () => {
  it("shows the count and the oldest job's age while a job is running", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobsRunningIndicator jobs={[job({ jobId: "job_a" })]} />,
    );
    expect(markup).toContain("1 background job running</span>");
    expect(markup).toContain('aria-hidden="true" class="truncate"> · 45s</span>');
    expect(markup).toContain('role="status"');
  });

  it("pluralizes and ages from the oldest running job", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobsRunningIndicator
        jobs={[
          job({ jobId: "job_a", startedAtMs: NOW - 70_000 }),
          job({ jobId: "job_b", startedAtMs: NOW - 10_000 }),
        ]}
      />,
    );
    expect(markup).toContain("2 background jobs running</span>");
    expect(markup).toContain('aria-hidden="true" class="truncate"> · 1m 10s</span>');
  });

  it("renders nothing for finished jobs", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobsRunningIndicator
        jobs={[job({ jobId: "job_a", state: "finished", finishedReason: "finished" })]}
      />,
    );
    expect(markup).not.toContain("background job");
  });

  it("renders nothing once the hard deadline plus grace has passed", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobsRunningIndicator
        jobs={[job({ jobId: "job_a", startedAtMs: NOW - 682_000, deadlineMs: NOW - 62_000 })]}
      />,
    );
    expect(markup).not.toContain("background job");
  });

  // The working-row slot passes its own chrome (the row's border and padding).
  // An empty render must take that chrome with it, or an idle thread keeps a
  // bare separator line after the last job settles.
  it("carries the caller's row chrome, and drops it along with the line", () => {
    const chrome = "border-b border-border/60 px-1 pb-2 pt-1";
    expect(
      renderToStaticMarkup(
        <BackgroundJobsRunningIndicator jobs={[job({ jobId: "job_a" })]} className={chrome} />,
      ),
    ).toContain("border-b");
    expect(
      renderToStaticMarkup(
        <BackgroundJobsRunningIndicator
          jobs={[job({ jobId: "job_a", state: "finished" })]}
          className={chrome}
        />,
      ),
    ).toBe("");
  });

  // A job runs for minutes, so its dot must not repaint behind a scrolled-away
  // viewport or a hidden tab (repo rule: no continuously repainting animation).
  it("pauses its live dot when off-screen", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobsRunningIndicator jobs={[job({ jobId: "job_a" })]} />,
    );
    expect(markup).toContain("motion-safe:visible-animate-pulse");
    expect(markup).not.toContain("animate-pulse rounded-full");
  });

  // The line is the handle to the per-job details: a toggle, collapsed by
  // default, that must not render the list until opened.
  it("collapses by default and exposes the toggle state", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobsRunningIndicator
        jobs={[job({ jobId: "job_a", command: "sleep 30", pid: 4242 })]}
      />,
    );
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Running background jobs");
  });
});

describe("BackgroundJobList", () => {
  it("lists each running job with command, pid and elapsed over deadline", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobList
        running={[
          job({ jobId: "job_a", command: "node scripts/quality-gate.mjs", pid: 4242 }),
          job({ jobId: "job_b", command: "sleep 30", startedAtMs: NOW - 10_000, deadlineMs: NOW + 590_000 }),
        ]}
        now={NOW}
      />,
    );
    expect(markup).toContain("Running background jobs");
    // job_a: started 45s ago, deadline 10m from start -> 45s / 10m.
    expect(markup).toContain("node scripts/quality-gate.mjs");
    expect(markup).toContain("45s / 10m");
    expect(markup).toContain("pid 4242");
    // job_b: started 10s ago with a 10m window, and no pid on record ->
    // the row still renders, without a pid line.
    expect(markup).toContain("sleep 30");
    expect(markup).toContain("10s / 10m");
  });

  it("degrades to the job id when the row never carried a command", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobList running={[job({ jobId: "job_old" })]} now={NOW} />,
    );
    // The id doubles as the displayed command; no pid line.
    expect(markup).toContain("job_old");
    expect(markup).not.toContain("pid ");
  });
});

describe("BackgroundJobRunningBadge", () => {
  it("tags the originating tool row while the job runs", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobRunningBadge job={job({ jobId: "job_a" })} />,
    );
    expect(markup).toContain("<span>running in background</span>");
    expect(markup).toContain(">· 45s</span>");
  });

  it("un-tags the row once the job settles", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobRunningBadge
        job={job({ jobId: "job_a", state: "finished", finishedReason: "cancelled" })}
      />,
    );
    expect(markup).not.toContain("running in background");
  });
});
