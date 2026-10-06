// @vitest-environment jsdom
import type { ProjectShellProject } from "@t3tools/project-context";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const reload = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => {},
}));

vi.mock("~/t3team/t3team-AppStatusBits", () => ({
  AppProjectIcon: () => null,
}));

vi.mock("~/t3team/hooks/t3team-useProjectMyWork", () => ({
  useProjectMyWork: () => ({
    tickets: [],
    loading: false,
    error: "Jira timed out",
    sessionExpired: false,
    reload,
    lastCheckedAt: undefined,
  }),
}));

const { AllProjectsMyWorkSection } = await import("./t3team-AllProjectsMyWorkSection");

const project = {
  id: "project-1",
  title: "Nexplore Platform",
  source: { provider: "atlassian", externalProjectKey: "NEX" },
} as unknown as ProjectShellProject;

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  reload.mockReset();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("AllProjectsMyWorkSection error", () => {
  it("retries that project's fetch from the error line", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <AllProjectsMyWorkSection project={project} lens="hierarchy" onOpenTicket={() => {}} />,
      );
    });
    expect(container.textContent).toContain("Nexplore Platform");
    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry",
    );
    await act(async () => retry?.click());
    expect(reload).toHaveBeenCalledOnce();
  });
});
