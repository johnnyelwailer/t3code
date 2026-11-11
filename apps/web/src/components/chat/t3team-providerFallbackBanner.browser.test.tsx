/**
 * The automatic swap to Nexplore AI is allowed only because the composer shows it (hive#1280):
 * both provider names on screen, and the original one click away.
 */
import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { ComposerBannerStack } from "./ComposerBannerStack";
import { providerFallbackBannerItem } from "./t3team-providerFallbackBanner";

const FALLBACK = {
  requestedInstanceId: ProviderInstanceId.make("claudeAgent"),
  requestedDisplayName: "Claude Code",
  fallbackInstanceId: ProviderInstanceId.make("nexplore"),
  fallbackDisplayName: "Nexplore AI",
} as const;

describe("provider fallback indicator", () => {
  it("names both providers and puts the requested one back with one click", async () => {
    const onUseRequested = vi.fn();
    const onDismiss = vi.fn();
    await using screen = await render(
      <ComposerBannerStack
        items={[providerFallbackBannerItem({ fallback: FALLBACK, onUseRequested, onDismiss })]}
        detached
      />,
      { router: false },
    );

    await expect.element(screen.getByText("Using Nexplore AI")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Claude Code can't start on this machine"))
      .toBeInTheDocument();

    await userEvent.click(screen.getByTestId("provider-fallback-use-requested"));
    expect(onUseRequested).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss Nexplore AI notice" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
