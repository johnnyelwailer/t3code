import { describe, expect, it } from "vite-plus/test";

import { selectBoundProjects } from "~/t3team/t3team-AllProjectsMyWorkView";
import { parseT3TeamViewFromPath, resolveT3TeamRouteSearchTarget } from "~/t3team/t3team-routeState";
import { readProjectIdFromView } from "~/t3team/t3team-types";

const project = (id: string, provider: string) =>
  ({ id, title: id, source: { provider } }) as unknown as Parameters<
    typeof selectBoundProjects
  >[0][number];

describe("all-projects my work", () => {
  it("routes /t3team/my-work to the project-less view, both ways", () => {
    expect(parseT3TeamViewFromPath("/t3team/my-work")).toEqual({ type: "all-my-work" });
    expect(resolveT3TeamRouteSearchTarget("/t3team/my-work")).toEqual({ to: "/t3team/my-work" });
  });

  // The regression this guards: `my-work` sits at the same depth as a project id, so a parser that
  // checked segment count before the literal would read it as project "my-work" and render an
  // empty dashboard instead.
  it("does not mistake the segment for a project id", () => {
    expect(parseT3TeamViewFromPath("/t3team/projects/my-work")).toEqual({
      type: "dashboard",
      projectId: "my-work",
    });
  });

  it("reports no project for the view, so project-scoped callers opt out explicitly", () => {
    expect(readProjectIdFromView({ type: "all-my-work" })).toBeNull();
    expect(readProjectIdFromView({ type: "dashboard", projectId: "p1" })).toBe("p1");
  });

  // Backlog is deliberately absent from this surface; My work is only meaningful for projects
  // that actually have an external work source, so local-only projects are filtered out rather
  // than rendered as permanently empty sections.
  it("includes only projects bound to a work source", () => {
    const projects = [
      project("bound", "atlassian"),
      project("local-only", "local"),
      project("github", "github"),
    ];
    expect(selectBoundProjects(projects).map((entry) => entry.id)).toEqual(["bound", "github"]);
  });
});
