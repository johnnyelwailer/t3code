import type { BackgroundJobState } from "@t3tools/client-runtime/work-log/background-jobs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  BackgroundJobRunningBadge,
  BackgroundJobsRunningIndicator,
} from "./BackgroundJobsIndicator";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
vi.setSystemTime(NOW);

const job = (
  overrides: Partial<BackgroundJobState> & Pick<BackgroundJobState, "jobId">,
): BackgroundJobState => ({
  jobId: overrides.jobId,
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
    expect(markup).toContain("1 background job running · 45s");
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
    expect(markup).toContain("2 background jobs running · 1m 10s");
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
});

describe("BackgroundJobRunningBadge", () => {
  it("tags the originating tool row while the job runs", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobRunningBadge job={job({ jobId: "job_a" })} />,
    );
    expect(markup).toContain("running in background · 45s");
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
