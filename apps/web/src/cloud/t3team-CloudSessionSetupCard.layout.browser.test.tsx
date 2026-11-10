/**
 * ChatView puts the setup card in the messages-timeline footer beside the thread detail panel.
 * This mounts that same column/panel shell so the card's bounds stay in the message lane.
 */
import type { CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { render } from "../../test/render";
import { CloudSessionSetupCard } from "./t3team-CloudSessionSetupCard";
import { CloudSessionSetupFooter } from "./t3team-cloudSessionSetupFooter";

/** Layout-only shell: no router routes or navigation. */
const noRouter: { readonly router: false } = { router: false };

function session(): CloudSession {
  return {
    sessionId: "session-1",
    providerKind: "github_actions",
    phase: "preparing",
    elapsedSeconds: 40,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim",
    failureReason: null,
    detailsUrl: null,
  };
}

function ChatViewSetupFooterLayout({ sending }: { readonly sending?: boolean }) {
  return (
    <div
      data-chat-view-layout=""
      style={{
        position: "relative",
        display: "flex",
        width: "56rem",
        height: "24rem",
        background: "var(--background, #fff)",
      }}
    >
      <div
        data-message-column=""
        style={{ position: "relative", flex: "1 1 0%", minWidth: 0, overflow: "hidden" }}
      >
        <div style={{ position: "absolute", inset: 0, overflow: "auto" }}>
          <CloudSessionSetupFooter>
            <CloudSessionSetupCard
              facts={{
                session: session(),
                machineConnected: false,
                delivery: sending ? "sending" : "queued",
              }}
              sending={sending}
              onCancel={() => {}}
              frozenElapsedSeconds={40}
              motion="still"
            />
          </CloudSessionSetupFooter>
        </div>
      </div>
      <aside
        data-thread-details-panel=""
        style={{
          flexShrink: 0,
          width: "17.5rem",
          borderInlineStart: "1px solid var(--border, #ddd)",
          background: "var(--card, #fafafa)",
        }}
      >
        Thread details
      </aside>
    </div>
  );
}

describe("CloudSessionSetupCard in ChatView footer layout", () => {
  it("keeps a single step-list indicator and stays inside the message column", async () => {
    await using screen = await render(<ChatViewSetupFooterLayout />, noRouter);
    const card = screen.container.querySelector("[data-cloud-setup-card]")!;
    const column = screen.container.querySelector("[data-message-column]")!;
    const detail = screen.container.querySelector("[data-thread-details-panel]")!;
    const footer = screen.container.querySelector("[data-cloud-setup-footer]")!;

    expect(card.querySelectorAll("[data-cloud-setup-progress]")).toHaveLength(1);
    expect(card.querySelector("[role='progressbar']")).toBeNull();
    expect(card.querySelector(".t3team-setup-orb")).toBeNull();
    expect(footer.querySelector(".chat-content-lane")).not.toBeNull();

    const cardBox = card.getBoundingClientRect();
    const columnBox = column.getBoundingClientRect();
    const detailBox = detail.getBoundingClientRect();
    expect(columnBox.width).toBeGreaterThan(0);
    expect(detailBox.width).toBeGreaterThan(100);
    expect(cardBox.width).toBeGreaterThan(0);
    expect(cardBox.right).toBeLessThanOrEqual(columnBox.right + 0.5);
    expect(cardBox.left).toBeGreaterThanOrEqual(columnBox.left - 0.5);
    expect(cardBox.right).toBeLessThanOrEqual(detailBox.left + 0.5);
  });

  it("does not add a second sending strip while the footer card owns the hand-off", async () => {
    await using screen = await render(<ChatViewSetupFooterLayout sending />, noRouter);
    const layout = screen.container.querySelector("[data-chat-view-layout]")!;
    expect(layout.querySelector("h3")?.textContent).not.toContain("Sending to cloud session");
    expect(layout.querySelectorAll("[data-cloud-setup-progress]")).toHaveLength(1);
    expect(
      [...layout.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Sending"),
      ),
    ).toBe(true);
    expect(layout.querySelector("[role='status']")?.textContent).toBe("Sending your message.");
  });
});
