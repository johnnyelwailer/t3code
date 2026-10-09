import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("~/t3team/t3team-ProjectDashboardKickoffAside", () => ({
  ProjectDashboardKickoffAside: ({ project }: { project: ProjectShellProject }) => (
    <div>{`kickoff:${project.id}`}</div>
  ),
}));

const { AllProjectsKickoffAside } = await import("./t3team-AllProjectsKickoffAside");

const noop = () => undefined;

describe("AllProjectsKickoffAside", () => {
  it("renders the dashboard kickoff host for the scratch project", () => {
    const markup = renderToStaticMarkup(
      <AllProjectsKickoffAside
        scratchProject={{ id: "scratch-1" } as unknown as ProjectShellProject}
        onStartScratch={undefined}
        providers={[]}
        isConnected
        onOpenThread={noop}
        onOpenFullThread={noop}
        onThreadKickoffConsumed={noop}
        onKickoffProjectThread={noop}
      />,
    );
    expect(markup).toContain("kickoff:scratch-1");
  });

  it("offers starting a no-project chat when scratch is not ready yet", () => {
    const markup = renderToStaticMarkup(
      <AllProjectsKickoffAside
        scratchProject={null}
        onStartScratch={noop}
        providers={[]}
        isConnected
        onOpenThread={noop}
        onOpenFullThread={noop}
        onThreadKickoffConsumed={noop}
        onKickoffProjectThread={noop}
      />,
    );
    expect(markup).toContain("Start a chat without a project");
    expect(markup).not.toContain("Open a pull request or a work item");
  });
});
