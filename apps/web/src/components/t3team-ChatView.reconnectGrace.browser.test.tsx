import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";
import { useEnvironmentStateHeldFor } from "../hooks/useEnvironmentDisconnectDelay";
import { ENVIRONMENT_RECONNECT_WARNING_GRACE_MS } from "./ChatView.logic";
import {
  LOCAL_ENVIRONMENT_RECONNECT_NOTICE_GRACE_MS,
  environmentReconnectGraceMs,
} from "./t3team-environmentReconnectBanner";

const first = EnvironmentId.make("env-first");
const second = EnvironmentId.make("env-second");

// Mirrors how useSystemComposerBanners feeds upstream's useEnvironmentStateHeldFor: the grace
// comes from environmentReconnectGraceMs(isLocal), so a local backend restart stays quiet longer.
function Probe(props: { environmentId: EnvironmentId | null; isLocal: boolean }) {
  const held = useEnvironmentStateHeldFor(
    props.environmentId,
    environmentReconnectGraceMs(props.isLocal),
  );
  return <output>{held ? "warn" : "quiet"}</output>;
}

describe("environment reconnect warning grace (local backend)", () => {
  it("honours a longer grace for the local backend than for a remote one", async () => {
    await using screen = await render(<Probe environmentId={first} isLocal />, {
      // A bare hook probe; nothing here navigates.
      router: false,
    });
    using _timers = fakeTimers();
    // A fresh outage: the grace restarts on every environment change.
    await screen.rerender(<Probe environmentId={second} isLocal />);
    await expect.element(screen.getByText("quiet")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTime(ENVIRONMENT_RECONNECT_WARNING_GRACE_MS));
    await expect.element(screen.getByText("quiet")).toBeInTheDocument();

    await act(() =>
      vi.advanceTimersByTime(
        LOCAL_ENVIRONMENT_RECONNECT_NOTICE_GRACE_MS - ENVIRONMENT_RECONNECT_WARNING_GRACE_MS - 1,
      ),
    );
    await expect.element(screen.getByText("quiet")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTime(1));
    await expect.element(screen.getByText("warn")).toBeInTheDocument();
  });

  it("warns a remote environment after the short upstream grace", async () => {
    await using screen = await render(<Probe environmentId={first} isLocal={false} />, {
      router: false,
    });
    using _timers = fakeTimers();
    await screen.rerender(<Probe environmentId={second} isLocal={false} />);
    await expect.element(screen.getByText("quiet")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTime(ENVIRONMENT_RECONNECT_WARNING_GRACE_MS));
    await expect.element(screen.getByText("warn")).toBeInTheDocument();
  });
});
