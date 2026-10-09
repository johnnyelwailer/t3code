// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ProjectDashboardKanbanZoomControl } from "~/t3team/t3team-ProjectDashboardKanbanZoomControl";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

async function renderControl(level: "full" | "compact" | "at-a-glance") {
  const changes: Array<"full" | "compact" | "at-a-glance"> = [];
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(
      <ProjectDashboardKanbanZoomControl
        level={level}
        onLevelChange={(next) => changes.push(next)}
      />,
    );
  });
  return { container, changes };
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) continue;
    await act(async () => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.innerHTML = "";
});

describe("ProjectDashboardKanbanZoomControl", () => {
  it("renders quiet zoom-out / zoom-in buttons", async () => {
    const { container } = await renderControl("compact");
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Zoom out",
      "Zoom in",
    ]);
    expect(buttons.every((button) => !button.disabled)).toBe(true);
    const group = container.querySelector("[role='group']");
    expect(group).not.toBeNull();
    expect(group!.getAttribute("aria-label")).toBe("Kanban zoom");
  });

  it("zooms out one snap and zooms in one snap", async () => {
    const { container, changes } = await renderControl("compact");
    const [zoomOut, zoomIn] = [...container.querySelectorAll("button")];
    await act(async () => {
      zoomOut!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      zoomIn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(changes).toEqual(["at-a-glance", "full"]);
  });

  it("disables zoom-out at at-a-glance and zoom-in at full", async () => {
    const glance = await renderControl("at-a-glance");
    const glanceButtons = [...glance.container.querySelectorAll("button")];
    expect(glanceButtons[0]?.disabled).toBe(true);
    expect(glanceButtons[1]?.disabled).toBe(false);

    const full = await renderControl("full");
    const fullButtons = [...full.container.querySelectorAll("button")];
    expect(fullButtons[0]?.disabled).toBe(false);
    expect(fullButtons[1]?.disabled).toBe(true);
  });
});
