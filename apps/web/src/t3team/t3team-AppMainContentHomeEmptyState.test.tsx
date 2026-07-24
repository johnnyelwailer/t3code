import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AppMainContentHomeEmptyState } from "./t3team-AppMainContentHomeEmptyState";

vi.mock("~/t3team/t3team-CreateProjectDialog", () => ({
  CreateProjectDialog: ({ variant }: { variant: string }) => <div>create-dialog:{variant}</div>,
}));

vi.mock("./t3team-AppMainContentShell", () => ({
  ProjectBrowserEmptyWithChat: ({
    showInlineCreateWizard,
    emptyContent,
  }: {
    showInlineCreateWizard?: boolean;
    emptyContent?: ReactNode;
  }) => (
    <div>
      browser-empty:{showInlineCreateWizard ? "wizard" : "welcome"}
      {emptyContent}
    </div>
  ),
}));

describe("AppMainContentHomeEmptyState", () => {
  it("starts on the welcome surface when reopened from settings", () => {
    const markup = renderToStaticMarkup(
      <AppMainContentHomeEmptyState
        onCreate={() => {}}
        onInlineProjectCreated={() => {}}
        showInitialSetup
        showAside={false}
        homeChatProject={null}
        homeChatProjectThreads={[]}
        providers={[]}
        isConnected
        onOpenHomeThread={() => {}}
        onKickoffHomeThread={(() => {}) as never}
      />,
    );

    expect(markup).toContain("browser-empty:welcome");
    expect(markup).not.toContain("create-dialog:inline");
  });
});
