import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { BackgroundJobOutputPanel } from "./BackgroundJobOutputPanel";
import type { ThreadJobsController } from "~/t3team/backend/t3team-thread-jobsBackend";

/** A controller that never resolves its promise: the panel must render its
 *  pre-first-page state ("waiting for output…") without crashing. */
const HANGING_CONTROLLER: ThreadJobsController = () => new Promise(() => {});

describe("BackgroundJobOutputPanel", () => {
  it("renders its header (live state, close button) before the first page lands", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobOutputPanel
        threadId="thread_a"
        jobId="job_8865dcbe"
        controller={HANGING_CONTROLLER}
        onClose={() => {}}
      />,
    );
    // The panel carries no job identity of its own: the job's row above
    // already says what this is, so no command or id is re-rendered here.
    expect(markup).toContain('aria-label="Background job output"');
    expect(markup).not.toContain("job_8865dcbe");
    // Live until the runtime says the job settled.
    expect(markup).toContain(">live</span>");
    // The tail is empty until the first page arrives.
    expect(markup).toContain("waiting for output…");
    // Close affordance is present.
    expect(markup).toContain('aria-label="Close job output"');
  });

  it("does not repeat the job row's information", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobOutputPanel
        threadId="thread_a"
        jobId="job_a1b2c3d4"
        controller={HANGING_CONTROLLER}
        onClose={() => {}}
      />,
    );
    expect(markup).not.toContain("job_a1b2c3d4");
    expect(markup).toContain("waiting for output…");
  });

  it("does not claim to be settled before the runtime says so", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobOutputPanel
        threadId="thread_a"
        jobId="job_a1b2c3d4"
        controller={HANGING_CONTROLLER}
        onClose={() => {}}
      />,
    );
    expect(markup).not.toContain(">settled</span>");
  });
});
