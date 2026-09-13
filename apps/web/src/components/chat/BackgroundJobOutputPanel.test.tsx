import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { BackgroundJobOutputPanel } from "./BackgroundJobOutputPanel";
import type { ThreadJobsController } from "~/t3team/backend/t3team-thread-jobsBackend";

/** A controller that never resolves its promise: the panel must render its
 *  pre-first-page state ("waiting for output…") without crashing. */
const HANGING_CONTROLLER: ThreadJobsController = () => new Promise(() => {});

describe("BackgroundJobOutputPanel", () => {
  it("renders its header (command, live state, close button) before the first page lands", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobOutputPanel
        threadId="thread_a"
        jobId="job_8865dcbe"
        command="pnpm -r build"
        controller={HANGING_CONTROLLER}
        onClose={() => {}}
      />,
    );
    // The command heads the panel; the region is labelled for it.
    expect(markup).toContain('aria-label="Output of pnpm -r build"');
    expect(markup).toContain("pnpm -r build");
    // Live until the runtime says the job settled.
    expect(markup).toContain(">live</span>");
    // The tail is empty until the first page arrives.
    expect(markup).toContain("waiting for output…");
    // Close affordance is present.
    expect(markup).toContain('aria-label="Close job output"');
  });

  it("degrades to the job id when no command is on record", () => {
    const markup = renderToStaticMarkup(
      <BackgroundJobOutputPanel
        threadId="thread_a"
        jobId="job_a1b2c3d4"
        controller={HANGING_CONTROLLER}
        onClose={() => {}}
      />,
    );
    expect(markup).toContain("job_a1b2c3d4");
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
