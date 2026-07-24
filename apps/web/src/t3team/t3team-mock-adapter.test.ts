/* oxlint-disable unicorn/prefer-array-find -- Existing merged lint debt; keep green while preserving behavior. */
/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import { t3teamCreateProject } from "~/t3team/t3team-mock-adapter";

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

describe("t3teamCreateProject", () => {
  it("uses the project title for the managed workspace directory name", async () => {
    const project = await Effect.runPromise(
      t3teamCreateProject({
        title: "Project Alpha",
        sourceProvider: "atlassian",
      }),
    );

    expect(project.workspace?.rootPath).toContain("/t3team/projects/");
    expect(project.workspace?.rootPath && basename(project.workspace.rootPath)).toBe(
      "Project Alpha",
    );
  });

  it("sanitizes filesystem-invalid title characters while keeping the name readable", async () => {
    const project = await Effect.runPromise(
      t3teamCreateProject({
        title: "QA: Payments / Checkout?",
        sourceProvider: "atlassian",
      }),
    );

    expect(project.workspace?.rootPath && basename(project.workspace.rootPath)).toBe(
      "QA Payments Checkout",
    );
  });
});
