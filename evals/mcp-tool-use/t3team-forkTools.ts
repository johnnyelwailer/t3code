/**
 * The fork's own MCP tools for the eval, with the text an agent is advertised. Upstream's harness
 * reads the raw toolkits; the fork's tools are advertised with minimal text
 * (`t3team-toolDocs.ts`), so the eval applies the same layer. `T3_EVAL_FULL_TOOL_TEXT=1` skips it,
 * which gives the "before" side of a comparison from the same checkout.
 */
import { advertiseToolDocs } from "../../apps/server/src/mcp/toolkits/t3team/t3team-toolDocs.ts";
import { T3TeamToolkit } from "../../apps/server/src/mcp/toolkits/t3team/tools.ts";
import {
  fieldDescriptionsByPath,
  originalToolDocs,
} from "../../apps/server/src/mcp/toolkits/t3team/t3team-toolDocs.ts";

export const forkToolkit = T3TeamToolkit;

const fullText = process.env.T3_EVAL_FULL_TOOL_TEXT === "1";

/** Records the registered text either way, so `t3_tool_help` answers in both arms. */
export const advertisedToolText = <
  T extends { name: string; description?: string; inputSchema: unknown },
>(
  tool: T,
) => {
  const advertised = advertiseToolDocs(tool);
  return fullText ? tool : { ...tool, ...advertised };
};

/** The full-text arm is the diet's "before": it has no `t3_tool_help`. */
export const listedInEval = (name: string) => !(fullText && name === "t3_tool_help");

/** What the fork tool answers when a case has no mock for it. */
export const forkToolDefault = (name: string, input: Readonly<Record<string, unknown>>) => {
  if (name !== "t3_tool_help") return undefined;
  const docs = originalToolDocs(String(input.tool));
  return docs === undefined
    ? { error: `No T3 tool named ${String(input.tool)}.` }
    : {
        tool: input.tool,
        description: docs.description ?? "",
        fields: fieldDescriptionsByPath(docs.inputSchema),
      };
};
