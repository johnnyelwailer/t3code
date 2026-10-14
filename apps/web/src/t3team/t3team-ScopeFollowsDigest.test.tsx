// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/t3team/hooks/t3team-useTicketAgentContext", () => ({
  useTicketAgentContext: () => ({
    getTicketAgentContext: () => null,
    openTicketAgentContextMenu: () => {},
  }),
}));

const { ScopeFollowsDigestFixture } = await import("./t3team-ScopeFollowsDigestFixture");

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("My Work digest follows the sidebar project scope", () => {
  let root: Root;
  let host: HTMLElement;

  const settle = () =>
    act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
  const click = async (name: string) => {
    const control = [...host.querySelectorAll("button")].find((b) => b.textContent === name);
    if (!control) throw new Error(`No control named ${name}`);
    await act(async () => control.click());
    await settle();
  };
  const digest = () => host.querySelector('[aria-label="Digest"]');

  beforeEach(async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<ScopeFollowsDigestFixture />));
    await settle();
  });
  afterEach(() => act(async () => root.unmount()));

  it("shows every bound project under All projects", () => {
    expect(digest()?.getAttribute("data-digest-scope")).toBe("all");
    expect(digest()?.textContent).toContain("IES-18425");
    expect(digest()?.textContent).toContain("NXAI-8");
  });

  it("switches to one project's digest and back without a reload, never mixing the two", async () => {
    await click("Nexi AI");
    expect(digest()?.getAttribute("data-digest-scope")).toBe("project");
    expect(digest()?.textContent).toContain("NXAI-8");
    expect(digest()?.textContent).not.toContain("IES-18425");

    await click("IES NG");
    expect(digest()?.textContent).toContain("IES-18425");
    expect(digest()?.textContent).not.toContain("NXAI-8");

    await click("All projects");
    expect(digest()?.getAttribute("data-digest-scope")).toBe("all");
    expect(digest()?.textContent).toContain("NXAI-8");
    expect(digest()?.textContent).toContain("IES-18425");
  });

  it("keeps the all-projects digest when Back from a ticket lands on one project's board", async () => {
    await click("Back from a Nexi AI ticket");
    expect(digest()?.getAttribute("data-digest-scope")).toBe("all");
    expect(digest()?.textContent).toContain("IES-18425");
  });
});
