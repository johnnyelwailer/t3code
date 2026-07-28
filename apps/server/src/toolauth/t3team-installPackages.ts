/**
 * Static package identity for "install this CLI" (`ToolAuthInstallService`).
 * This table — never client input — is the ONLY thing that decides what gets
 * spawned: the client sends nothing but a `ToolAuthToolId`, this table maps
 * it to an npm package name, and the service turns that into a fixed argv.
 *
 * Deliberately duplicates `CodexDriver.ts`'s and `ClaudeDriver.ts`'s `UPDATE`
 * maintenance definitions rather than importing them: those modules pull in
 * `ChildProcessSpawner`, `HttpClient`, `ServerSettingsService` and the rest of
 * the provider-driver dependency graph, which has no business being reachable
 * from a small, auditable "spawn npm install -g" code path.
 *
 * MUST STAY IN SYNC with:
 *   - apps/server/src/provider/Drivers/CodexDriver.ts:64-69
 *     (`npmPackageName: "@openai/codex"`, `homebrewFormula: "codex"`)
 *   - apps/server/src/provider/Drivers/ClaudeDriver.ts:74-75
 *     (`npmPackageName: "@anthropic-ai/claude-code"`, `homebrewFormula: "claude-code"`)
 *
 * @module toolauth/installPackages
 */
import { CLAUDE, CODEX, FAKE } from "./t3team-adapters.ts";

export interface ToolInstallPackage {
  readonly npmPackageName: string;
  /** Not consumed yet — npm is the only package manager this service drives today. */
  readonly homebrewFormula: string;
}

export const TOOL_INSTALL_PACKAGES: Record<string, ToolInstallPackage> = {
  [CLAUDE.tool]: { npmPackageName: "@anthropic-ai/claude-code", homebrewFormula: "claude-code" },
  [CODEX.tool]: { npmPackageName: "@openai/codex", homebrewFormula: "codex" },
  // Test/dev only, mirrors `FAKE` in `t3team-adapters.ts` — never exposed over the wire.
  [FAKE.tool]: {
    npmPackageName: "@t3code-toolauth-fixture/fake",
    homebrewFormula: "t3code-toolauth-fixture-fake",
  },
};

export function getInstallPackage(tool: string): ToolInstallPackage {
  const pkg = TOOL_INSTALL_PACKAGES[tool];
  if (!pkg) {
    throw new Error(
      `unknown installable tool '${tool}' (have: ${Object.keys(TOOL_INSTALL_PACKAGES).join(", ")})`,
    );
  }
  return pkg;
}
