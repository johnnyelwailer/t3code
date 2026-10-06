// @vitest-environment jsdom
import type { ProjectShellProject } from "@t3tools/project-context";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const liveProjects: unknown[] = [];
vi.mock("~/state/entities", () => ({ useProjects: () => liveProjects }));
// The sidebar's scope pills render this exact component; stand in for it so the test can see
// which project record it was handed (its real atom/network plumbing is not under test here).
vi.mock("~/components/ProjectFavicon", () => ({
  ProjectFavicon: ({ project }: { project: { id: string; faviconPath: string } }) => (
    <span data-favicon={project.id} data-favicon-path={project.faviconPath} />
  ),
}));

const { AppProjectIcon } = await import("~/t3team/t3team-AppStatusBits");

const shell = (id: string) =>
  ({
    id,
    title: "Intranet Entwicklung",
    source: { provider: "atlassian", externalProjectKey: "IE" },
    createdAt: "",
    updatedAt: "",
  }) as unknown as ProjectShellProject;

let root: Root | null = null;
let container: HTMLDivElement;

async function render(project: ProjectShellProject) {
  await act(async () => {
    root = createRoot(container);
    root.render(<AppProjectIcon project={project} />);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  liveProjects.length = 0;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("project icon in the dashboard header", () => {
  it("draws the live project's own icon, like the sidebar scope pills, not an initials avatar", async () => {
    liveProjects.push({ id: "ie", faviconPath: "project-icons/ie.png", workspaceRoot: "/w/ie" });
    await render(shell("ie"));
    const favicon = container.querySelector("[data-favicon]");
    expect(favicon?.getAttribute("data-favicon")).toBe("ie");
    expect(favicon?.getAttribute("data-favicon-path")).toBe("project-icons/ie.png");
    expect(container.textContent).not.toContain("IE");
  });

  it("falls back to the tracker avatar only when no live project backs it", async () => {
    await render(shell("unbacked"));
    expect(container.querySelector("[data-favicon]")).toBeNull();
    expect(container.textContent).toContain("IE");
  });
});
