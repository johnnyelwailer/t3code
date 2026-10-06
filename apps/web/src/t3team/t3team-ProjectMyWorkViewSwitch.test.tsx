// @vitest-environment jsdom
import type { ProjectShellProject } from "@t3tools/project-context";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ProjectMyWorkViewSwitch } from "~/t3team/t3team-ProjectMyWorkViewSwitch";

const project = (id: string, title: string) => ({ id, title }) as unknown as ProjectShellProject;

let root: Root | null = null;
let container: HTMLDivElement;

async function render(element: React.ReactElement) {
  await act(async () => {
    root = createRoot(container);
    root.render(element);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("My work view switch Backlog segment", () => {
  it("asks which project when the view has none, then opens that project's backlog", async () => {
    const onPick = vi.fn();
    await render(
      <ProjectMyWorkViewSwitch
        lens="digest"
        onLensChange={() => {}}
        backlog={{
          kind: "pick-project",
          projects: [project("p1", "Nexi Platform"), project("p2", "Intranet")],
          onPick,
        }}
      />,
    );

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-segment="backlog"]')?.click(),
    );
    const popup = document.body.querySelector('[data-slot="menu-popup"]');
    expect(popup?.textContent).toContain("Backlog of…");

    const intranet = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === "Intranet",
    );
    await act(async () => intranet?.click());
    expect(onPick).toHaveBeenCalledExactlyOnceWith("p2");
  });

  it("says so instead of listing nothing when no project can have a backlog", async () => {
    await render(
      <ProjectMyWorkViewSwitch
        lens="digest"
        onLensChange={() => {}}
        backlog={{ kind: "pick-project", projects: [], onPick: vi.fn() }}
      />,
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-segment="backlog"]')?.click(),
    );
    expect(document.body.textContent).toContain("No project with a backlog yet");
  });

  it("is absent without a backlog (the digest fixture keeps its three lenses)", async () => {
    await render(<ProjectMyWorkViewSwitch lens="board" onLensChange={() => {}} />);
    expect(container.querySelector('[data-segment="backlog"]')).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(3);
  });
});
