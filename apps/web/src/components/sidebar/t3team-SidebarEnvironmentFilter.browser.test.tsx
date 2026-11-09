import { resolveEnvironmentFilter } from "@t3tools/client-runtime/t3team-environmentFilter";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { T3TeamSidebarEnvironmentFilter } from "./t3team-SidebarEnvironmentFilter";

const THIS_COMPUTER = { id: "local", label: "This computer", isPrimary: true };
const CLOUD = { id: "cloud", label: "Cloud session" };

function pills(
  environments: Array<{ id: string; label: string; isPrimary?: boolean }>,
  id: string | null = null,
) {
  return resolveEnvironmentFilter({ environments, selectedId: id }).pills;
}

describe("T3TeamSidebarEnvironmentFilter", () => {
  it("draws nothing while there is nothing to choose", async () => {
    await using screen = await render(
      <T3TeamSidebarEnvironmentFilter pills={pills([THIS_COMPUTER])} onSelect={vi.fn()} />,
      { router: false },
    );
    expect(screen.container.querySelector('[role="group"]')).toBeNull();
    expect(screen.container.textContent).toBe("");
  });

  it("offers real buttons in a labelled group and marks the selection", async () => {
    await using screen = await render(
      <T3TeamSidebarEnvironmentFilter
        pills={pills([THIS_COMPUTER, CLOUD], "cloud")}
        onSelect={vi.fn()}
      />,
      { router: false },
    );
    await expect.element(screen.getByRole("group", { name: "Environment" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cloud session" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(screen.getByRole("button", { name: "This computer" }))
      .toHaveAttribute("aria-pressed", "false");
    await expect
      .element(screen.getByRole("button", { name: "All" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("selects on click and on keyboard, All resets to null", async () => {
    const onSelect = vi.fn();
    await using screen = await render(
      <T3TeamSidebarEnvironmentFilter
        pills={pills([THIS_COMPUTER, CLOUD], "cloud")}
        onSelect={onSelect}
      />,
      { router: false },
    );
    await userEvent.click(screen.getByRole("button", { name: "This computer" }));
    expect(onSelect).toHaveBeenLastCalledWith("local");

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onSelect.mock.calls.length).toBeGreaterThan(1);

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("wraps at a narrow width without cutting 'This computer'", async () => {
    const container = document.createElement("div");
    container.style.width = "150px";
    await using screen = await render(
      <T3TeamSidebarEnvironmentFilter
        pills={pills([THIS_COMPUTER, CLOUD, { id: "srv", label: "Build server" }])}
        onSelect={vi.fn()}
      />,
      { container, router: false },
    );
    const label = [...screen.container.querySelectorAll("span")].find(
      (node) => node.textContent === "This computer",
    )!;
    expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
    const rows = new Set(
      [...screen.container.querySelectorAll("button")].map((button) => button.offsetTop),
    );
    expect(rows.size).toBeGreaterThan(1);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
  });
});
