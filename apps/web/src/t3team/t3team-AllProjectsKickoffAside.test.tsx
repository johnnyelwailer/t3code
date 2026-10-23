import { renderToStaticMarkup } from "react-dom/server";
import { ProviderInstanceId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectDashboardKickoffAsideProps } from "~/t3team/t3team-ProjectDashboardKickoffAsideTypes";

vi.mock("~/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

const renderedAside = vi.hoisted(() => ({
  onKickoffThread: undefined as ProjectDashboardKickoffAsideProps["onKickoffThread"] | undefined,
}));

vi.mock("~/t3team/t3team-ProjectDashboardKickoffAside", () => ({
  ProjectDashboardKickoffAside: ({
    project,
    onKickoffThread,
  }: Pick<ProjectDashboardKickoffAsideProps, "project" | "onKickoffThread">) => {
    renderedAside.onKickoffThread = onKickoffThread;
    return <div>{`kickoff:${project.id}`}</div>;
  },
}));

const { AllProjectsKickoffAside } = await import("./t3team-AllProjectsKickoffAside");

const noop = () => undefined;
const createdThreadId = () => "thread-created";

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
        onKickoffProjectThread={createdThreadId}
      />,
    );
    expect(markup).toContain("kickoff:scratch-1");
  });

  // A Quick Start click starts its recipe on the thread this returns; without the id the click
  // only left an empty thread behind.
  it("hands the created thread id back to the Quick Start launch", () => {
    const onKickoffProjectThread = vi.fn(createdThreadId);
    renderToStaticMarkup(
      <AllProjectsKickoffAside
        scratchProject={{ id: "scratch-1" } as unknown as ProjectShellProject}
        onStartScratch={undefined}
        providers={[]}
        isConnected
        onOpenThread={noop}
        onOpenFullThread={noop}
        onThreadKickoffConsumed={noop}
        onKickoffProjectThread={onKickoffProjectThread}
      />,
    );

    const threadId = renderedAside.onKickoffThread?.(
      "Rank what needs me",
      false,
      { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" },
      "full-access",
      "default",
      [],
      [],
    );

    expect(threadId).toBe("thread-created");
    expect(onKickoffProjectThread).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "scratch-1",
        dashboardMode: "my-work",
        kickoffMessage: "Rank what needs me",
        kickoffPending: false,
      }),
    );
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
        onKickoffProjectThread={createdThreadId}
      />,
    );
    expect(markup).toContain("Start a chat without a project");
    expect(markup).not.toContain("Open a pull request or a work item");
  });
});
