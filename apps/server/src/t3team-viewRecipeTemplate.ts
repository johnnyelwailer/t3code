import { digestArrangementDrifted } from "./t3team-myworkArrangeDrift.ts";

const quote = (value: string): string => JSON.stringify(value);
const SURFACE = /^[a-z][a-z0-9.]{0,80}$/;
const READ_CALL = /^t3team(?:\.[A-Za-z][A-Za-z0-9]*)+\(\{[^}]*\}\)$/;

/**
 * A maintain recipe for one view surface. The prompt and the read call are supplied by the
 * surface adapter (My Work today). User text is inserted only through JSON.stringify.
 */
export type ViewRecipeRenderInput = {
  readonly id: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly surface: string;
  readonly everyHours: number;
  readonly maintainPrompt: string;
  /** Tool call expression, for example `t3team.mywork.digest.read({})`. */
  readonly readCall: string;
  /** Function source that turns a tool result into a stable signature string. */
  readonly signatureFunctionSource: string;
};

export function renderViewRecipe(input: ViewRecipeRenderInput): {
  readonly recipeTs: string;
  readonly workflowTs: string;
} {
  if (!SURFACE.test(input.surface)) throw new Error("Recipe surface is not a view-surface id.");
  if (!READ_CALL.test(input.readCall)) throw new Error("Recipe read call is not an allowlisted tool call.");
  const recipeTs = [
    `import { defineRecipe, defineWorkflow } from "@t3team/sdk";`,
    `import type * as Workflow from "./workflow.ts";`,
    ``,
    `export default defineRecipe({`,
    `  id: ${quote(input.id)},`,
    `  version: "1.0.0",`,
    `  scope: "project",`,
    `  title: ${quote(input.title)},`,
    `  shortDescription: ${quote(input.shortDescription)},`,
    `  surfaces: [${quote(input.surface)}],`,
    `  icon: "sparkles",`,
    `  allowedToolGroups: ["integration.read", "view.state"],`,
    `  defaultAction: defineWorkflow<typeof Workflow>("./workflow.ts"),`,
    `});`,
    ``,
  ].join("\n");
  const workflowTs = [
    `import { Schema } from "effect";`,
    `import { accumulate, agent, getTools, now, phase, reducerState, waitUntil } from "@t3team/sdk";`,
    ``,
    `const meta = {`,
    `  name: ${quote(input.id)},`,
    `  description: ${quote(input.shortDescription)},`,
    `  capabilities: ["schedule", "user"],`,
    `  outputs: Schema.Struct({ maintained: Schema.Boolean, passes: Schema.Number }),`,
    `  phases: [{ title: "Maintain" }],`,
    `} as const;`,
    ``,
    `const viewSignature = ${input.signatureFunctionSource};`,
    `const viewDrifted = ${digestArrangementDrifted.toString()};`,
    ``,
    `const MAX_PASSES = 48;`,
    `const HOUR_MS = 60 * 60 * 1000;`,
    ``,
    `export default async function run() {`,
    `  const tools = getTools();`,
    `  let passes = reducerState("maintain")?.current?.passes ?? 0;`,
    `  while (passes < MAX_PASSES) {`,
    `    phase("Maintain");`,
    `    const view = await tools.${input.readCall};`,
    `    const signature = viewSignature(view);`,
    `    const previous = reducerState("maintain")?.current?.signature ?? "";`,
    `    if (previous.length > 0 && viewDrifted(previous, signature)) {`,
    `      await agent(${quote(input.maintainPrompt)}, {`,
    `        capabilities: "inherit",`,
    `        label: "Revise arrangement",`,
    `        schema: Schema.Struct({ stored: Schema.Boolean }),`,
    `      });`,
    `    }`,
    `    passes += 1;`,
    `    await accumulate("maintain", (_current, reading) => reading, { signature, passes });`,
    `    if (passes < MAX_PASSES) await waitUntil(now() + ${input.everyHours} * HOUR_MS);`,
    `  }`,
    `  return { maintained: true, passes };`,
    `}`,
    ``,
  ].join("\n");
  return { recipeTs, workflowTs };
}
