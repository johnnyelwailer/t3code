/**
 * Embedded in generated workflows (the loader binds no imports). True when at least a quarter of
 * the signature lines changed: only then does the maintain loop spend an agent turn. Smaller
 * changes re-resolve on the client from the stored refs.
 */
export const VIEW_DRIFTED_SOURCE = `function viewDrifted(previous, next) {
  if (previous === next) return false;
  const before = new Set(previous.split("\\n").filter((line) => line.length > 0));
  const after = next.split("\\n").filter((line) => line.length > 0);
  let shared = 0;
  for (const line of after) if (before.has(line)) shared += 1;
  return 1 - shared / Math.max(before.size, after.length, 1) >= 0.25;
}`;

const quote = (value: string): string => JSON.stringify(value);
const SURFACE = /^[a-z][A-Za-z0-9.]{0,80}$/;
const RECIPE_ID = /^[a-z][a-z0-9-]{0,40}$/;
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
  if (!RECIPE_ID.test(input.id)) throw new Error("Recipe id must be a short kebab-case id.");
  if (!SURFACE.test(input.surface)) throw new Error("Recipe surface is not a view-surface id.");
  if (!READ_CALL.test(input.readCall))
    throw new Error("Recipe read call is not an allowlisted tool call.");
  const recipeTs = [
    `import { defineRecipe, defineWorkflow } from "@t3team/sdk";`,
    `import type * as Workflow from ${quote(`./${input.id}.workflow.ts`)};`,
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
    `  defaultAction: defineWorkflow<typeof Workflow>(${quote(`./${input.id}.workflow.ts`)}),`,
    `});`,
    ``,
  ].join("\n");
  const workflowTs = [
    `import { Schema } from "effect";`,
    `import { accumulate, agent, getTools, now, phase, reducerState, waitUntil } from "@t3team/sdk";`,
    ``,
    `const Outputs = Schema.Struct({ maintained: Schema.Boolean, passes: Schema.Number });`,
    `const Revised = Schema.Struct({ stored: Schema.Boolean });`,
    ``,
    `export const meta = {`,
    `  name: ${quote(input.id)},`,
    `  description: ${quote(input.shortDescription)},`,
    `  capabilities: ["integration.read", "view.state", "schedule"],`,
    `  outputs: Outputs,`,
    `  phases: [{ title: "Maintain" }],`,
    `} as const;`,
    ``,
    `const viewSignature = ${input.signatureFunctionSource};`,
    `const viewDrifted = ${VIEW_DRIFTED_SOURCE};`,
    ``,
    `const MAX_PASSES = 48;`,
    `const HOUR_MS = 60 * 60 * 1000;`,
    ``,
    `type Pass = { readonly signature: string; readonly passes: number };`,
    ``,
    `export default async function run() {`,
    `  // eslint-disable-next-line typescript/no-explicit-any -- the read call is a generated tool path`,
    `  const tools = getTools<Record<string, any>>();`,
    `  let passes = reducerState<Pass>("maintain")?.current?.passes ?? 0;`,
    `  while (passes < MAX_PASSES) {`,
    `    phase("Maintain");`,
    `    const view = await tools.${input.readCall};`,
    `    const signature = viewSignature(view);`,
    `    const previous = reducerState<Pass>("maintain")?.current?.signature ?? "";`,
    `    if (previous.length > 0 && viewDrifted(previous, signature)) {`,
    `      await agent(${quote(input.maintainPrompt)}, {`,
    `        capabilities: "inherit",`,
    `        label: "Revise arrangement",`,
    `        schema: Revised,`,
    `      });`,
    `    }`,
    `    passes += 1;`,
    `    await accumulate<Pass, Pass>("maintain", (_current, reading) => reading, { signature, passes });`,
    `    if (passes < MAX_PASSES) await waitUntil(now() + ${input.everyHours} * HOUR_MS);`,
    `  }`,
    `  return { maintained: true, passes };`,
    `}`,
    ``,
  ].join("\n");
  return { recipeTs, workflowTs };
}
