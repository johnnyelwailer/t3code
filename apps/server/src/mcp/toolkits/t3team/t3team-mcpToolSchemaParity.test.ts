/**
 * What an agent READS about a tool's arguments must match what the runtime ENFORCES.
 *
 * Hive #599: `label` was described as optional but required at runtime. It cost 732 extra round
 * trips on one day and 64 sessions failed their very first call. Each t3team tool carries its
 * contract in up to three places (the catalog's JSON schema and descriptions, the MCP `Tool.make`
 * schema, the SDK registry schema); this pins them to each other, for every mapped tool.
 */
import * as Schema from "effect/Schema";
import * as Tool from "effect/ai/Tool";
import { describe, expect, it } from "vite-plus/test";

import { RunWorkflowToolArgs } from "@t3team/sdk/tools/t3teamWorkflow";
import { getT3TeamToolDefinition } from "@t3tools/project-context/t3teamToolCatalog";

import { T3TEAM_MCP_CANONICAL_TOOL_MAP } from "../../../t3team-mcpCanonicalToolMap.ts";
import { T3TeamToolkit } from "./tools.ts";

interface ObjectSchema {
  readonly properties: Readonly<Record<string, { readonly description?: unknown }>>;
  readonly required: ReadonlyArray<string>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const objectSchema = (value: unknown): ObjectSchema | undefined => {
  if (!isRecord(value) || !isRecord(value.properties)) return undefined;
  const properties: Record<string, { readonly description?: unknown }> = {};
  for (const [key, entry] of Object.entries(value.properties)) {
    properties[key] = isRecord(entry) ? { description: entry.description } : {};
  }
  const required = Array.isArray(value.required)
    ? value.required.filter((item): item is string => typeof item === "string")
    : [];
  return { properties, required };
};

const toolkitTools: Readonly<Record<string, Tool.Any>> = T3TeamToolkit.tools;

const mapped = Object.entries(T3TEAM_MCP_CANONICAL_TOOL_MAP).flatMap(([mcpName, canonicalId]) => {
  const tool = toolkitTools[mcpName];
  const catalog = objectSchema(getT3TeamToolDefinition(canonicalId).inputSchema);
  const mcp = tool === undefined ? undefined : objectSchema(Tool.getJsonSchema(tool));
  return catalog === undefined || mcp === undefined ? [] : [{ mcpName, catalog, mcp }];
});

const decodeMcpRunArgs = Schema.decodeUnknownResult(
  T3TeamToolkit.tools.t3_orchestration_run.parametersSchema,
);
const decodeSdkRunArgs = Schema.decodeUnknownResult(RunWorkflowToolArgs);

/** Wording that tells an agent it may leave the argument out. */
const SAYS_OPTIONAL = /^\s*optional\b|\bomit\b|\bmay omit\b/i;

describe("t3team MCP tool argument contracts", () => {
  it("covers the orchestration tools", () => {
    expect(mapped.map((entry) => entry.mcpName)).toEqual(
      expect.arrayContaining([
        "t3_orchestration_run",
        "t3_orchestration_status",
        "t3_orchestration_resume",
      ]),
    );
  });

  it.each(mapped)("$mcpName advertises the catalog's properties and required set", (entry) => {
    expect(Object.keys(entry.mcp.properties).toSorted()).toEqual(
      Object.keys(entry.catalog.properties).toSorted(),
    );
    expect([...entry.mcp.required].toSorted()).toEqual([...entry.catalog.required].toSorted());
  });

  it.each(mapped)("$mcpName never requires an argument its description calls optional", (entry) => {
    for (const schema of [entry.catalog, entry.mcp]) {
      for (const name of schema.required) {
        const description = schema.properties[name]?.description;
        expect(typeof description === "string" && SAYS_OPTIONAL.test(description), name).toBe(
          false,
        );
      }
    }
  });

  // Every form the run tool's description offers decodes in the MCP layer AND the SDK registry.
  it.each([
    { intent: "Build the release APK" },
    { intent: { goal: "Sweep PRs" } },
    { intent: { goal: "g", expectedOutcome: "o", guardrails: ["x"] } },
    { source: "export const meta = {} as const;" },
    { workflowPath: "flows/a.workflow.ts" },
    { recipe: "daily-sweep", action: "run" },
  ])("t3_orchestration_run accepts %j at every layer", (args) => {
    expect(decodeMcpRunArgs(args)._tag).toBe("Success");
    expect(decodeSdkRunArgs(args)._tag).toBe("Success");
  });
});
