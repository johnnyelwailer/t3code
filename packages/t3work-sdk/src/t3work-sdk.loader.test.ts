import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { extractMeta, prepareWorkflow, type WorkflowSource } from "./t3work-sdk.loader.ts";

const metaName = (sourceText: string): string => {
  const source: WorkflowSource = { absolutePath: "/virtual/meta.workflow.ts", sourceText };
  return extractMeta(prepareWorkflow(source), source, Schema).name;
};

describe("workflow loader meta declarations", () => {
  it.each([
    ["plain const", 'const meta = { name: "plain" } as const;', "plain"],
    ["exported const", 'export const meta = { name: "exported" } as const;', "exported"],
  ])("extracts %s", (_kind, source, expected) => {
    expect(metaName(source)).toBe(expected);
  });
});
