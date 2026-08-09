import { describe, expect, it } from "vite-plus/test";

import { extractMeta, prepareWorkflow, runWorkflowBody, type WorkflowSource } from "./loader.ts";

const source = (sourceText: string): WorkflowSource => ({
  absolutePath: "/virtual/generic.workflow.ts",
  sourceText,
});

describe("@runbook/ts trusted loader", () => {
  it("extracts metadata with an adapter-provided pure global", () => {
    const input = source("const meta = { name: workflowName } as const;");
    expect(
      extractMeta(prepareWorkflow(input), input, {}, { globals: { workflowName: "review" } }),
    ).toEqual({
      name: "review",
    });
  });

  it("runs both legacy top-level bodies and named default-export bodies", async () => {
    const legacy = source('const meta = { name: "legacy" } as const; return await add(2, 3);');
    expect(
      await runWorkflowBody(prepareWorkflow(legacy), legacy, {
        add: (a: number, b: number) => a + b,
      }),
    ).toBe(5);

    const module = source(
      'const meta = { name: "module" } as const;\nexport default async function run() { return await add(4, 5); }',
    );
    expect(
      await runWorkflowBody(prepareWorkflow(module), module, {
        add: (a: number, b: number) => a + b,
      }),
    ).toBe(9);
  });

  it("rejects an unnamed default export with the stable loader error", () => {
    const input = source('const meta = { name: "bad" } as const; export default async () => 1;');
    expect(() => prepareWorkflow(input)).toThrow(
      /default-exports something the engine cannot call/,
    );
  });
});
