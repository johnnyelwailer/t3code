import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../../test/render";
import { OfflineWorkingLabel } from "./t3team-offlineWorkingLabel";

describe("OfflineWorkingLabel", () => {
  it("says the thread was last seen working, with no timer", async () => {
    await using screen = await render(<OfflineWorkingLabel state="offline" />, { router: false });
    expect(screen.container.textContent).toBe("Offline — last seen working");
    expect(screen.container.textContent).not.toMatch(/\d+s\b/);
  });

  it("stays frozen as time passes: nothing ticks while the state is unknown", async () => {
    using _timers = fakeTimers();
    await using screen = await render(<OfflineWorkingLabel state="offline" />, { router: false });
    const before = screen.container.textContent;
    await act(() => vi.advanceTimersByTime(60_000));
    expect(screen.container.textContent).toBe(before);
  });

  it("says the cloud session ended when it did", async () => {
    await using screen = await render(<OfflineWorkingLabel state="ended" />, { router: false });
    expect(screen.container.textContent).toBe("Cloud session ended");
  });
});
