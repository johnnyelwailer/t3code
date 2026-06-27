import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  ProjectSidebarDashboardNav,
  shouldAutoExpandMyWorkForPin,
} from "./t3work-ProjectSidebarDashboardNav";

const inactiveState = { isSelected: false, isOpen: false };

function renderNav(
  overrides: Partial<React.ComponentProps<typeof ProjectSidebarDashboardNav>> = {},
): string {
  return renderToStaticMarkup(
    <ProjectSidebarDashboardNav
      backlogState={inactiveState}
      myWorkState={inactiveState}
      myWorkExpanded
      myWorkThreadCount={0}
      onMyWorkExpandedChange={() => {}}
      onSelectBacklog={() => {}}
      onSelectMyWork={() => {}}
      backlogContent={undefined}
      myWorkContent={undefined}
      showMyActivityFeed
      showJiraItems={false}
      currentIssueCount={0}
      currentIssuesContent={<div>Current issues</div>}
      showGitHubActivity={false}
      githubItems={[]}
      {...overrides}
    />,
  );
}

describe("ProjectSidebarDashboardNav", () => {
  it("hides the my work chevron when the section has no children", () => {
    const markup = renderNav({ myWorkContent: <div>My work threads</div> });

    expect(markup).not.toContain("Expand my work");
    expect(markup).not.toContain("Collapse my work");
    expect(markup).not.toContain("My work threads");
  });

  it("shows the my work chevron when jira items keep the section populated", () => {
    const markup = renderNav({
      showJiraItems: true,
      currentIssueCount: 1,
    });

    expect(markup).toContain("Collapse my work");
    expect(markup).toContain("Current issues");
  });

  it("shows pinned items inside my work when pins are present", () => {
    const markup = renderNav({
      pinnedItemCount: 1,
      pinnedContent: <div>Pinned items</div>,
    });

    expect(markup).toContain("Collapse my work");
    expect(markup).toContain("Pinned items");
  });

  it("auto-expands collapsed My Work only when the pin signal increases", () => {
    expect(
      shouldAutoExpandMyWorkForPin({
        previousSignal: 0,
        nextSignal: 1,
        myWorkExpanded: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoExpandMyWorkForPin({
        previousSignal: 1,
        nextSignal: 1,
        myWorkExpanded: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoExpandMyWorkForPin({
        previousSignal: 0,
        nextSignal: 1,
        myWorkExpanded: true,
      }),
    ).toBe(false);
  });

  it("hides my activity feed content when the feed is disabled", () => {
    const markup = renderNav({
      showMyActivityFeed: false,
      myWorkThreadCount: 1,
      myWorkContent: <div>My work threads</div>,
      pinnedItemCount: 1,
      pinnedContent: <div>Pinned items</div>,
    });

    expect(markup).toContain("Pinned items");
    expect(markup).not.toContain("My work threads");
  });
});
