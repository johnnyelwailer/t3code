import { describe, expect, it } from "@effect/vitest";

import { getInstallPackage, TOOL_INSTALL_PACKAGES } from "./adapters.ts";
import { buildNpmInstallArgv } from "./installCommand.ts";

describe("buildNpmInstallArgv", () => {
  it("is a plain npm global install argv, never a shell string", () => {
    expect(buildNpmInstallArgv("@openai/codex")).toEqual([
      "npm",
      "install",
      "-g",
      "@openai/codex@latest",
    ]);
  });

  it("has no shell metacharacters that would matter if a package name were ever hostile", () => {
    // Even a maximally adversarial package name only ever becomes ONE argv
    // element — never concatenated into a command string, so `;`/`&&`/`|`
    // inside it can't break out of the argument boundary.
    const argv = buildNpmInstallArgv("evil; rm -rf / #");
    expect(argv).toEqual(["npm", "install", "-g", "evil; rm -rf / #@latest"]);
    expect(argv[0]).toBe("npm");
    expect(argv.length).toBe(4);
  });
});

describe("the static install-package table — the ONLY thing that decides what gets spawned", () => {
  it("resolves the real tool ids to their exact known npm packages", () => {
    expect(getInstallPackage("claude").npmPackageName).toBe("@anthropic-ai/claude-code");
    expect(getInstallPackage("codex").npmPackageName).toBe("@openai/codex");
  });

  it("produces the exact argv `ToolAuthService.install()` will spawn, for each real tool id", () => {
    expect(buildNpmInstallArgv(getInstallPackage("claude").npmPackageName)).toEqual([
      "npm",
      "install",
      "-g",
      "@anthropic-ai/claude-code@latest",
    ]);
    expect(buildNpmInstallArgv(getInstallPackage("codex").npmPackageName)).toEqual([
      "npm",
      "install",
      "-g",
      "@openai/codex@latest",
    ]);
  });

  it("throws for any id outside the table — mirrors the closed ToolAuthToolId union on the wire", () => {
    expect(() => getInstallPackage("anything-else")).toThrow();
  });

  it("only defines packages for the tools this surface knows about", () => {
    expect(Object.keys(TOOL_INSTALL_PACKAGES).sort()).toEqual(["claude", "codex", "fake"].sort());
  });
});
