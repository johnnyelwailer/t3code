/**
 * No click on this card is ever silent (hive#1280). The install request that started this: the
 * server answered it with `phase: "failed"` as a SUCCESS value and never touched the status
 * stream, so the card — whose phase came only from that stream — kept showing the same button and
 * the click looked ignored.
 */
import type { ToolAuthState } from "@t3tools/contracts";
import { memo } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { fakeTimers, render } from "../../../test/render";
import { renderCounter } from "../../test/t3team-renderCounter";
import type { ToolAuthActionOutcome } from "../../state/t3team-toolauthActionOutcome";
import { ToolAuthCard } from "./t3team-ToolAuthCard";
import { TOOL_AUTH_TOOLS } from "./t3team-toolAuthTools";
import { TOOL_AUTH_ACTION_TIMEOUT_MS } from "./t3team-useToolAuthCardAction";

const CLAUDE = TOOL_AUTH_TOOLS.find((meta) => meta.tool === "claude")!;
const noop = () => {};
const noRouter: { readonly router: false } = { router: false };

function card(input: {
  readonly state?: ToolAuthState | undefined;
  readonly onInstall: () => Promise<ToolAuthActionOutcome> | void;
}) {
  return (
    <ToolAuthCard
      meta={CLAUDE}
      state={input.state}
      machineLabel="this cloud machine"
      onConnect={noop}
      onInstall={input.onInstall}
      onSubmitCode={noop}
      onCancel={noop}
    />
  );
}

describe("ToolAuthCard install and connect", () => {
  it("shows a pending state on the click itself, before the machine answers anything", async () => {
    // Never settles: the card must not need an answer to acknowledge the click.
    const onInstall = vi.fn(() => new Promise<ToolAuthActionOutcome>(() => {}));
    await using screen = await render(card({ onInstall }), noRouter);

    await userEvent.click(screen.getByTestId("toolauth-primary-action"));
    expect(onInstall).toHaveBeenCalledTimes(1);
    await expect
      .element(screen.getByTestId("toolauth-pending"))
      .toHaveTextContent("Starting install…");
    expect(screen.container.querySelector("[data-testid='toolauth-primary-action']")).toBeNull();
  });

  it("turns a returned failed phase into an inline error with Retry, stream or no stream", async () => {
    const onInstall = vi.fn(async (): Promise<ToolAuthActionOutcome> => ({
      kind: "failed",
      reason: "featureDisabled",
    }));
    await using screen = await render(card({ onInstall }), noRouter);

    await userEvent.click(screen.getByTestId("toolauth-primary-action"));
    await expect
      .element(screen.getByTestId("toolauth-error"))
      .toHaveTextContent(
        "Claude Code sign-in isn't enabled on this cloud machine yet. Turn on CLI tool sign-in for this cloud machine, or sign Claude Code in from its terminal.",
      );
    await expect.element(screen.getByTestId("toolauth-retry")).toBeInTheDocument();
  });

  it("runs Retry exactly once however fast it is double-clicked", async () => {
    const onInstall = vi.fn(() => new Promise<ToolAuthActionOutcome>(() => {}));
    await using screen = await render(
      card({ onInstall, state: { tool: "claude", phase: "failed", reason: "installFailed" } }),
      noRouter,
    );

    const retry = screen.getByTestId("toolauth-retry");
    await userEvent.dblClick(retry);
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it("reports a request nothing came back from once the patience window elapses", async () => {
    await using screen = await render(
      card({ onInstall: () => new Promise<ToolAuthActionOutcome>(() => {}) }),
      noRouter,
    );
    // Acquired after the render so it is restored before the unmount.
    using _timers = fakeTimers({ shouldAdvanceTime: true });

    await userEvent.click(screen.getByTestId("toolauth-primary-action"));
    await expect.element(screen.getByTestId("toolauth-pending")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(TOOL_AUTH_ACTION_TIMEOUT_MS + 1);
    await expect
      .element(screen.getByTestId("toolauth-error"))
      .toHaveTextContent(
        "This cloud machine hasn't answered the request to set up Claude Code. Retry, or check the machine is still connected.",
      );
    await expect.element(screen.getByTestId("toolauth-retry")).toBeInTheDocument();
  });

  it("keeps the pending state inside the clicked card, off the list around it", async () => {
    // The re-render budget for this change. Lifting pending into the list "so it can disable the
    // rest" would re-render every card in the Connected tools pane on each click.
    const counter = renderCounter();
    const CountingCard = memo(function CountingCard(props: { readonly rowId: string }) {
      counter.count(props.rowId);
      return card({ onInstall: () => new Promise<ToolAuthActionOutcome>(() => {}) });
    });
    await using screen = await render(
      <div>
        <CountingCard rowId="card-0" />
        <CountingCard rowId="card-1" />
      </div>,
      noRouter,
    );
    counter.reset();

    const buttons = screen.container.querySelectorAll<HTMLButtonElement>(
      "[data-testid='toolauth-primary-action']",
    );
    await userEvent.click(buttons[1]!);

    await expect.element(screen.getByTestId("toolauth-pending")).toBeInTheDocument();
    expect(screen.container.querySelectorAll("[data-testid='toolauth-pending']")).toHaveLength(1);
    counter.expectRerendered({});
  });

  it("hands the card back to the status stream as soon as it reports a phase", async () => {
    const onInstall = vi.fn(async (): Promise<ToolAuthActionOutcome> => ({
      kind: "started",
      state: { tool: "claude", phase: "installing" },
    }));
    await using screen = await render(card({ onInstall }), noRouter);

    await userEvent.click(screen.getByTestId("toolauth-primary-action"));
    await expect.element(screen.getByTestId("toolauth-pending")).toBeInTheDocument();

    screen.rerender(
      card({ onInstall, state: { tool: "claude", phase: "installing", installLog: "added 1" } }),
    );
    await expect.element(screen.getByText("Installing", { exact: false })).toBeInTheDocument();
    expect(screen.container.querySelector("[data-testid='toolauth-pending']")).toBeNull();
  });
});
