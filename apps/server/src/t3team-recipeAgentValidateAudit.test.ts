/**
 * Phase-25.5 wiring: the load-time determinism + capability audits reach agents through the
 * static validate path (`t3team.recipe.validate`), so an authoring agent sees them BEFORE a run.
 * The scan rules themselves are covered in packages/t3team-sdk/src/t3team-sdk.staticAudit.test.ts.
 */
import { describe, expect, it } from "vite-plus/test";

import { validateInlineWorkflowSourceForAgent } from "./t3team-recipeAgentValidateStatic.ts";

const HEAD = (capabilities: string) =>
  [
    `import { Schema } from "effect";`,
    ``,
    `export const meta = {`,
    `  name: "audit.fixture",`,
    `  description: "Static-audit wiring fixture.",`,
    `  capabilities: [${capabilities}],`,
    `} as const;`,
    ``,
  ].join("\n");

describe("validate path — determinism audit", () => {
  it("reports a non-type runtime import as a 'determinism' issue", () => {
    const result = validateInlineWorkflowSourceForAgent(
      [
        `import { helper } from "./helper.ts";`,
        HEAD(""),
        `return { done: helper !== undefined };`,
      ].join("\n"),
    );

    expect(result.ok).toBe(false);
    const determinism = result.errors.filter((error) => error.phase === "determinism");
    expect(determinism).toHaveLength(1);
    expect(determinism[0]?.message).toContain("runtime-import");
    expect(determinism[0]?.message).toMatch(/at \d+:\d+:/);
    expect(determinism[0]?.message).toContain("./helper.ts");
  });

  it("reports an unbound nondeterministic host global and names the durable replacement", () => {
    const result = validateInlineWorkflowSourceForAgent(
      [HEAD(""), `setTimeout(() => {}, 10);`, `return { done: true };`].join("\n"),
    );

    expect(result.ok).toBe(false);
    const determinism = result.errors.filter((error) => error.phase === "determinism");
    expect(determinism).toHaveLength(1);
    expect(determinism[0]?.message).toContain("unjournaled-host-global");
    expect(determinism[0]?.message).toContain("wait(ms)");
  });

  it("does NOT flag the ambient nondeterminism Epic 25 rule 1 journals", () => {
    const result = validateInlineWorkflowSourceForAgent(
      [
        HEAD(""),
        `const stamp = Date.now() + new Date().getTime() + Math.random();`,
        `const id = crypto.randomUUID();`,
        `return { stamp, id };`,
      ].join("\n"),
    );

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("validate path — static capability audit", () => {
  it("reports askUser without the 'user' capability as a 'capability' issue", () => {
    const result = validateInlineWorkflowSourceForAgent(
      [HEAD(""), `const answer = await thread.askUser("Approve?");`, `return { answer };`].join(
        "\n",
      ),
    );

    expect(result.ok).toBe(false);
    const capability = result.errors.filter((error) => error.phase === "capability");
    expect(capability).toHaveLength(1);
    expect(capability[0]?.message).toContain("missing-capability");
    expect(capability[0]?.message).toContain("'user'");
    expect(capability[0]?.message).toContain("askUser");
  });

  it("reports scripts.* without the 'script' capability", () => {
    const result = validateInlineWorkflowSourceForAgent(
      [HEAD(`"user"`), `const prepared = await scripts.prepare({});`, `return { prepared };`].join(
        "\n",
      ),
    );

    expect(result.errors.filter((error) => error.phase === "capability")).toHaveLength(1);
  });

  it("accepts the same body once meta.capabilities declares the verbs", () => {
    const result = validateInlineWorkflowSourceForAgent(
      [
        HEAD(`"user", "script"`),
        `const answer = await thread.askUser("Approve?");`,
        `const prepared = await scripts.prepare({ answer });`,
        `return { prepared };`,
      ].join("\n"),
    );

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("skips capability rules when meta itself failed to extract", () => {
    // The meta error is the real finding; a guessed empty capability set would bury it.
    const result = validateInlineWorkflowSourceForAgent(
      [
        `export const meta = { description: "no name" } as const;`,
        `const answer = await thread.askUser("Approve?");`,
        `return { answer };`,
      ].join("\n"),
    );

    expect(result.errors.every((error) => error.phase === "meta")).toBe(true);
  });
});
