import { basename } from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { t3workCreateProject } from "~/t3work/t3work-mock-adapter";

describe("t3workCreateProject", () => {
  it("uses the project title for the managed workspace directory name", async () => {
    const project = await Effect.runPromise(
      t3workCreateProject({
        title: "Project Alpha",
        sourceProvider: "atlassian",
      }),
    );

    expect(project.workspace?.rootPath).toContain("/t3work/projects/");
    expect(project.workspace?.rootPath && basename(project.workspace.rootPath)).toBe(
      "Project Alpha",
    );
  });

  it("sanitizes filesystem-invalid title characters while keeping the name readable", async () => {
    const project = await Effect.runPromise(
      t3workCreateProject({
        title: "QA: Payments / Checkout?",
        sourceProvider: "atlassian",
      }),
    );

    expect(project.workspace?.rootPath && basename(project.workspace.rootPath)).toBe(
      "QA Payments Checkout",
    );
  });
});
