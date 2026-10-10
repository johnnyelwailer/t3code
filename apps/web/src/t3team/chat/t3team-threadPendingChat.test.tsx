import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ThreadPendingChat } from "~/t3team/chat/t3team-threadPendingChat";

describe("ThreadPendingChat", () => {
  it("renders retry guidance after a failed bootstrap", () => {
    const markup = renderToStaticMarkup(
      <ThreadPendingChat bootstrapStatus="failed" onRetryLaunch={() => {}} />,
    );

    expect(markup).toContain("Launch interrupted");
    expect(markup).toContain("Retry launch");
  });

  it("keeps the retry action disabled while bootstrap is still running", () => {
    const markup = renderToStaticMarkup(
      <ThreadPendingChat bootstrapStatus="running" onRetryLaunch={() => {}} />,
    );

    expect(markup).toContain("Creating thread...");
    expect(markup).toContain("Creating the conversation on the server.");
    expect(markup).toContain("disabled");
  });

  it("shows in-chat progress once the server shell exists and the run is still starting", () => {
    const markup = renderToStaticMarkup(
      <ThreadPendingChat bootstrapStatus="running" phase="preparing" compact />,
    );

    expect(markup).toContain("Starting the run...");
    expect(markup).toContain("Preparing context and starting the run.");
  });
});
