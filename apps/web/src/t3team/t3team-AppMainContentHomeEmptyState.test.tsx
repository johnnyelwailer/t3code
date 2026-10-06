import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AppMainContentHomeEmptyState } from "./t3team-AppMainContentHomeEmptyState";

const shellProps: Array<{ onCreate: () => void }> = [];

vi.mock("./t3team-AppMainContentShell", () => ({
  ProjectBrowserEmptyWithChat: (props: { onCreate: () => void }) => {
    shellProps.push(props);
    return <div>browser-empty:welcome</div>;
  },
}));

describe("AppMainContentHomeEmptyState", () => {
  it("shows the welcome surface and hands the create action straight to the route", () => {
    const onCreate = () => {};
    const markup = renderToStaticMarkup(
      <AppMainContentHomeEmptyState
        onCreate={onCreate}
        showAside={false}
        scratchProject={null}
        onStartScratch={undefined}
        providers={[]}
        isConnected
        onOpenHomeThread={() => {}}
        onKickoffHomeThread={(() => {}) as never}
      />,
    );

    expect(markup).toContain("browser-empty:welcome");
    // No inline copy of the wizard: "create" is the `/t3team/new` route, not local state.
    expect(shellProps.at(-1)?.onCreate).toBe(onCreate);
  });
});
