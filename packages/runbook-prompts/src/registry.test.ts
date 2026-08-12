// @effect-diagnostics nodeBuiltinImport:off - these tests exercise the
// registry's own filesystem I/O directly against tmp fixtures.
import { describe, expect, it } from "vite-plus/test";
import * as NodeURL from "node:url";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { resolvePrompt } from "./registry.js";

const fixturesDir = NodeURL.fileURLToPath(new URL("./fixtures/prompts", import.meta.url));

describe("prompt registry", () => {
  it("resolves an under-budget prompt with a stable content hash", () => {
    const first = resolvePrompt("under-budget", fixturesDir);
    const second = resolvePrompt("under-budget", fixturesDir);

    expect(first.id).toBe("under-budget");
    expect(first.version).toBe("1.0.0");
    expect(first.locBudget).toBe(10);
    expect(first.body).toContain("Line one.");
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).toBe(second.hash); // stable across repeated loads
  });

  it("throws a clear error when a prompt is over its locBudget", () => {
    expect(() => resolvePrompt("over-budget", fixturesDir)).toThrow(/over its locBudget of 2/);
  });

  it("rejects a file whose frontmatter id disagrees with the resolved id", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "prompt-id-mismatch-"));
    NodeFS.writeFileSync(
      NodePath.join(dir, "honest-name.md"),
      "---\nid: something-else\nversion: 1.0.0\nlocBudget: 10\n---\nBody.\n",
    );

    expect(() => resolvePrompt("honest-name", dir)).toThrow(
      /resolved for id "honest-name" declares id "something-else"/,
    );
  });

  it("throws a clear error for an unknown prompt id", () => {
    expect(() => resolvePrompt("does-not-exist", fixturesDir)).toThrow(
      /unknown prompt id "does-not-exist"/,
    );
  });
});

describe("prompt id containment (traversal reachable at depth 8 in the ported source)", () => {
  it("rejects ../ traversal at every depth", () => {
    for (let d = 1; d <= 12; d++) {
      expect(() => resolvePrompt(`${"../".repeat(d)}tmp/leak`, fixturesDir)).toThrow(
        /invalid prompt id/i,
      );
    }
  });

  it("rejects absolute ids and backslashes", () => {
    expect(() => resolvePrompt("/etc/hosts", fixturesDir)).toThrow(/invalid prompt id/i);
    expect(() => resolvePrompt("..\\..\\secret", fixturesDir)).toThrow(/invalid prompt id/i);
  });

  it("still resolves a legitimate nested id", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-prompt-nested-"));
    const nestedDir = NodePath.join(dir, "code-pr-review");
    NodeFS.mkdirSync(nestedDir, { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(nestedDir, "main.md"),
      "---\nid: code-pr-review/main\nversion: 0.1.0\nlocBudget: 5\n---\nReview body.\n",
    );
    const p = resolvePrompt("code-pr-review/main", dir);
    expect(p.id).toBe("code-pr-review/main");
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("counts bare-CR lines against the budget", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-prompt-cr-"));
    const body = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\r");
    NodeFS.writeFileSync(
      NodePath.join(dir, "cr.md"),
      `---\nid: cr\nversion: 1.0.0\nlocBudget: 5\n---\n${body}\n`,
    );
    expect(() => resolvePrompt("cr", dir)).toThrow(/over its locBudget/i);
  });
});
