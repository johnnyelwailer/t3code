/**
 * The full launch check composes gates that each already exist; what is asserted here is the
 * composition and the two gates the author incident needed: an unbound `@t3team/sdk` import is a
 * typed finding, a model literal the live catalog does not know is a typed finding that lists the
 * valid choices, and every example the generated reference ships passes the WHOLE check — the
 * reference can never teach a shape the launch gate rejects.
 */
import { ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { WORKFLOW_REFERENCE_EXAMPLES } from "@t3team/sdk";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it } from "vite-plus/test";

import {
  checkWorkflowSource,
  checkWorkflowSourceForValidate,
} from "./t3team-workflowSourceCheck.ts";

const makeProvider = (instanceId: string, slugs: ReadonlyArray<string>): ServerProvider =>
  ({
    instanceId,
    driver: instanceId,
    enabled: true,
    installed: true,
    models: slugs.map((slug) => ({ slug, name: slug, isCustom: false, capabilities: null })),
  }) as unknown as ServerProvider;

const providers = [makeProvider("nexplore", ["nexplore-a"]), makeProvider("codex", ["codex-a"])];
const baseModelSelection = createModelSelection(ProviderInstanceId.make("nexplore"), "nexplore-a");

const body = (head: string, call: string) =>
  [
    head,
    `export const meta = { name: "probe", description: "x" } as const;`,
    `export default async function run() { ${call} }`,
  ].join("\n");

describe("checkWorkflowSource", () => {
  it("names an unbound @t3team/sdk import as a bindings finding (the ReferenceError incident)", () => {
    const result = checkWorkflowSource({
      source: body(
        `import { agent, defineModelX } from "@t3team/sdk";`,
        `return defineModelX(agent);`,
      ),
      providers,
      baseModelSelection,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const binding = result.findings.find((item) => item.phase === "bindings");
    expect(binding?.message).toContain("defineModelX");
    expect(binding?.message).toContain("ReferenceError");
  });

  it("rejects a model literal the live catalog does not know, listing the valid choices", () => {
    const result = checkWorkflowSource({
      source: body(
        `import { agent } from "@t3team/sdk";`,
        `return agent("x", { capabilities: "inherit", model: "codex/gpt-9-nope" });`,
      ),
      providers,
      baseModelSelection,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const model = result.findings.find((item) => item.phase === "model");
    expect(model?.message).toContain("codex/gpt-9-nope");
    expect(model?.message).toContain("codex-a");
  });

  it("accepts a known model on another instance, and skips the model gate without a catalog", () => {
    const source = body(
      `import { agent } from "@t3team/sdk";`,
      `return agent("x", { capabilities: "inherit", model: "codex/codex-a" });`,
    );
    expect(checkWorkflowSource({ source, providers, baseModelSelection }).ok).toBe(true);
    expect(
      checkWorkflowSource({ source: source.replace("codex-a", "nope"), baseModelSelection }).ok,
    ).toBe(true);
  });

  it("stops at the format gate for YAML (no noise from later gates)", () => {
    const result = checkWorkflowSource({ source: "name: x\nsteps: []\n", baseModelSelection });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.findings.map((item) => item.phase)).toEqual(["format"]);
  });

  it("shapes the same verdict as the recipe.validate result an author iterates on", () => {
    const result = checkWorkflowSourceForValidate({
      source: body(`import { nope } from "@t3team/sdk";`, `return nope();`),
      providers,
      baseModelSelection,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((item) => item.phase)).toContain("bindings");
    expect(result.workflowPath).toBe("<inline>");
  });

  for (const example of WORKFLOW_REFERENCE_EXAMPLES) {
    it(`reference example "${example.title}" passes the full launch check`, () => {
      const result = checkWorkflowSource({ source: example.source, providers, baseModelSelection });
      expect(result.ok ? [] : result.findings).toEqual([]);
    });
  }
});
