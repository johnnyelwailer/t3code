import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ProjectMachineFile, RepositoryRelativePath } from "./t3team-projectMachine.ts";

const decodeFile = Schema.decodeUnknownExit(ProjectMachineFile);
const isPath = Schema.is(RepositoryRelativePath);

describe("RepositoryRelativePath", () => {
  it("accepts paths inside the repository", () => {
    for (const path of [
      ".devcontainer/devcontainer.json",
      ".devcontainer/api/devcontainer.json",
      "tools/..env/devcontainer.json",
      "a..b/devcontainer.json",
    ]) {
      expect(isPath(path), path).toBe(true);
    }
  });

  it("rejects paths that leave the repository", () => {
    for (const path of [
      "../other/devcontainer.json",
      ".devcontainer/../../x.json",
      "..",
      "/etc/devcontainer.json",
      "C:/x/devcontainer.json",
      ".devcontainer\\devcontainer.json",
    ]) {
      expect(isPath(path), path).toBe(false);
    }
  });
});

describe("ProjectMachineFile", () => {
  it("decodes a pointer with secrets declared by name", () => {
    const exit = decodeFile({
      version: 1,
      devcontainer: ".devcontainer/devcontainer.json",
      healthCheck: "pnpm test --run",
      secrets: [
        { name: "NPM_TOKEN", scope: "team", description: "Read token for the private registry" },
        { name: "JIRA_API_TOKEN", scope: "user" },
      ],
    });
    expect(exit._tag).toBe("Success");
  });

  it("refuses secret names that are not environment variables or are reserved by GitHub", () => {
    for (const name of ["npm_token", "1TOKEN", "MY-TOKEN", "GITHUB_TOKEN"]) {
      const exit = decodeFile({
        version: 1,
        devcontainer: ".devcontainer/devcontainer.json",
        secrets: [{ name, scope: "team" }],
      });
      expect(exit._tag, name).toBe("Failure");
    }
  });

  it("refuses a pointer outside the repository and an unknown version", () => {
    expect(decodeFile({ version: 1, devcontainer: "../x/devcontainer.json" })._tag).toBe("Failure");
    expect(decodeFile({ version: 2, devcontainer: ".devcontainer/devcontainer.json" })._tag).toBe(
      "Failure",
    );
  });
});
