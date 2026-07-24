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
    expect(markup).toContain("disabled");
  });
});
