/**
 * The tools an eval model sees, executed by the SAME code the server runs: the MCP parameter
 * schema decode, the SDK tool registry (arg normalization and checks), the author submission path
 * and the full static source check. A rejection here is a rejection in production.
 */
import { ProviderInstanceId, ServerProvider, type ModelSelection } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { T3TeamToolkit } from "../src/mcp/toolkits/t3team/tools.ts";
import {
  executeWorkflowSdkWorkflowRunTool,
  WorkflowSdkBridgeError,
} from "../src/t3team-workflowSdkToolBridge.ts";
import { submitAuthoredWorkflowSource } from "../src/t3team-workflowAuthorSubmit.ts";
import type { WorkflowAuthorSession } from "../src/t3team-workflowAuthorSession.ts";
import { workflowAuthoringHandoff } from "../src/t3team-toolBrokerWorkflowRunTools.ts";
import {
  checkWorkflowSource,
  checkWorkflowSourceForValidate,
} from "../src/t3team-workflowSourceCheck.ts";

const decodeProvider = Schema.decodeUnknownSync(ServerProvider);

const provider = (instanceId: string, driver: string, slugs: ReadonlyArray<string>) =>
  decodeProvider({
    instanceId,
    driver,
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-10-27T00:00:00.000Z",
    models: slugs.map((slug, index) => ({
      slug,
      name: slug,
      isCustom: false,
      capabilities: null,
      ...(index === 0 ? { isDefault: true } : {}),
    })),
  });

/** A catalog shaped like a real Nexi Work install: the Nexplore tiers plus two big providers. */
export const EVAL_PROVIDERS = [
  provider("nexplore", "nexplore", ["medium", "no-thinking", "low", "high", "conductor"]),
  provider("claudeAgent", "claudeAgent", ["claude-sonnet-5-5", "claude-opus-5-5"]),
  provider("codex", "codex", ["gpt-5.5", "gpt-5.5-mini"]),
];

const EVAL_BASE_SELECTION: ModelSelection = {
  instanceId: ProviderInstanceId.make("nexplore"),
  model: "conductor",
};

type ToolName =
  | "t3_recipe_validate"
  | "t3_orchestration_run"
  | "t3_orchestration_status"
  | "t3_recipe_list";

export const AUTHOR_TOOLS: ReadonlyArray<ToolName> = ["t3_recipe_validate", "t3_orchestration_run"];
export const CALLER_TOOLS: ReadonlyArray<ToolName> = [
  "t3_recipe_list",
  "t3_orchestration_run",
  "t3_orchestration_status",
];

export interface FunctionSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: unknown;
}

export const functionSpecs = (names: ReadonlyArray<ToolName>): ReadonlyArray<FunctionSpec> =>
  names.map((name) => {
    const tool = T3TeamToolkit.tools[name];
    return { name, description: tool.description ?? "", parameters: Tool.getJsonSchema(tool) };
  });

/** `schema` = the MCP layer refused the arguments; `tool` = the tool refused them; `check` = the
 * source check found defects (the expected authoring loop, not an interface failure). */
export type Rejection = "schema" | "tool" | "check";

export interface ToolOutcome {
  readonly text: string;
  readonly rejection?: Rejection | undefined;
  readonly launched?: boolean | undefined;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const DECODERS = {
  t3_recipe_validate: Schema.decodeUnknownResult(
    T3TeamToolkit.tools.t3_recipe_validate.parametersSchema,
  ),
  t3_orchestration_run: Schema.decodeUnknownResult(
    T3TeamToolkit.tools.t3_orchestration_run.parametersSchema,
  ),
  t3_orchestration_status: Schema.decodeUnknownResult(
    T3TeamToolkit.tools.t3_orchestration_status.parametersSchema,
  ),
  t3_recipe_list: Schema.decodeUnknownResult(T3TeamToolkit.tools.t3_recipe_list.parametersSchema),
};

function decodeArgs(
  name: ToolName,
  raw: string,
): { ok: true; value: unknown } | { ok: false; text: string } {
  let parsed: unknown;
  try {
    parsed = raw.trim().length === 0 ? {} : JSON.parse(raw);
  } catch (error) {
    return { ok: false, text: `Invalid JSON arguments: ${message(error)}` };
  }
  const decoded = DECODERS[name](parsed);
  return decoded._tag === "Success"
    ? { ok: true, value: decoded.success }
    : { ok: false, text: `Invalid arguments for ${name}: ${message(decoded.failure)}` };
}

const authorSession = (runId: string): WorkflowAuthorSession => ({
  runId,
  launchThreadId: "eval-launch",
  authorThreadId: `${runId}:author`,
  authorModelSelection: EVAL_BASE_SELECTION,
  intent: { goal: "eval", expectedOutcome: "eval", guardrails: ["eval"] },
  declined: false,
  submit: async (source) => {
    const result = checkWorkflowSource({
      source,
      providers: EVAL_PROVIDERS,
      baseModelSelection: EVAL_BASE_SELECTION,
    });
    return result.ok ? { ok: true, runId } : { ok: false, findings: result.findings };
  },
});

const runThroughSdk = (
  toolArgs: unknown,
  runWorkflow: Parameters<typeof executeWorkflowSdkWorkflowRunTool>[0]["runWorkflow"],
): Promise<ToolOutcome> =>
  Effect.runPromise(
    executeWorkflowSdkWorkflowRunTool({ toolArgs, runWorkflow }).pipe(
      Effect.match({
        onSuccess: (result) => ({ text: JSON.stringify(result), launched: true }),
        onFailure: (error) => ({
          text: error.message,
          rejection: error.message.startsWith("The source was not accepted")
            ? ("check" as const)
            : ("tool" as const),
        }),
      }),
    ),
  );

/** Execute one tool call as the author (`role: "author"`) or as the launching agent. */
export async function executeEvalTool(
  role: "author" | "caller",
  name: string,
  rawArgs: string,
): Promise<ToolOutcome> {
  const known = [...AUTHOR_TOOLS, ...CALLER_TOOLS].find((tool) => tool === name);
  if (known === undefined) return { text: `Unknown tool '${name}'.`, rejection: "schema" };
  const decoded = decodeArgs(known, rawArgs);
  if (!decoded.ok) return { text: decoded.text, rejection: "schema" };
  const args: { readonly source?: string } = decoded.value ?? {};
  switch (known) {
    case "t3_recipe_validate": {
      if (args.source === undefined) return { text: "Pass `source`.", rejection: "tool" };
      const result = checkWorkflowSourceForValidate({
        source: args.source,
        providers: EVAL_PROVIDERS,
        baseModelSelection: EVAL_BASE_SELECTION,
      });
      return {
        text: JSON.stringify(result),
        ...(result.ok ? {} : { rejection: "check" as const }),
      };
    }
    case "t3_recipe_list":
      return { text: JSON.stringify({ recipes: [] }) };
    case "t3_orchestration_status":
      return { text: JSON.stringify({ runs: [] }) };
    case "t3_orchestration_run":
      return role === "author"
        ? runThroughSdk(decoded.value, (sdkArgs) =>
            submitAuthoredWorkflowSource(authorSession("eval-run"), sdkArgs).pipe(
              Effect.mapError((text) => new WorkflowSdkBridgeError({ message: text, cause: text })),
            ),
          )
        : runThroughSdk(decoded.value, () => Effect.succeed(workflowAuthoringHandoff("eval-run")));
  }
}
