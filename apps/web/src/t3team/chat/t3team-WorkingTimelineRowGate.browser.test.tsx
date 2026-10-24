import { describe, expect, it, vi } from "vite-plus/test";

import type { EnvironmentLiveState } from "~/cloud/t3team-environmentLiveState";
import { TimelineRowCtx } from "~/components/chat/timelineRowContext";

import { render } from "../../../test/render";

let liveState: EnvironmentLiveState = "live";

vi.mock("~/cloud/t3team-useEnvironmentLiveState", () => ({
  useEnvironmentLiveState: () => liveState,
}));
vi.mock("~/components/chat/TimelineWorkGroupRows", () => ({
  WorkingTimelineRow: () => <div data-testid="real-working-row">Working for 15s</div>,
}));

const { T3TeamWorkingTimelineRow } = await import("./t3team-WorkingTimelineRowGate");

// The gate reads `threadRef` from context; the mocked hook ignores its value.
const ui = () => (
  <TimelineRowCtx value={{ threadRef: null } as never}>
    <T3TeamWorkingTimelineRow row={{ kind: "working" } as never} />
  </TimelineRowCtx>
);

describe("T3TeamWorkingTimelineRow", () => {
  it("keeps the real working row while the environment is live", async () => {
    liveState = "live";
    await using screen = await render(ui(), { router: false });
    expect(screen.container.textContent).toBe("Working for 15s");
  });

  it("replaces a counting working row with a frozen offline row", async () => {
    liveState = "offline";
    await using screen = await render(ui(), { router: false });
    expect(screen.container.querySelector("[data-testid=real-working-row]")).toBeNull();
    expect(screen.container.textContent).toBe("Offline — last seen working");
  });

  it("says the cloud session ended when it did", async () => {
    liveState = "ended";
    await using screen = await render(ui(), { router: false });
    expect(screen.container.textContent).toBe("Cloud session ended");
  });

  it("resumes the real row when the connection returns", async () => {
    liveState = "offline";
    await using screen = await render(ui(), { router: false });
    liveState = "live";
    await screen.rerender(ui());
    expect(screen.container.textContent).toBe("Working for 15s");
  });
});
