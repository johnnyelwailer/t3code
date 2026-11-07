#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off - wall-clock latency is the measurement.
/**
 * A stdio MCP server exposing the eval tools (same schemas, same server-side checks) so a CLI
 * agent such as Claude Code can be measured on exactly what the gateway eval measures. Env:
 * EVAL_ROLE (`author` | `caller`) and EVAL_LOG (a JSONL file that receives one line per call).
 */
import * as NodeFS from "node:fs";
import * as NodeReadline from "node:readline";

import {
  AUTHOR_TOOLS,
  CALLER_TOOLS,
  executeEvalTool,
  functionSpecs,
} from "./t3team-workflowAuthorEvalTools.ts";

const role = process.env.EVAL_ROLE === "caller" ? "caller" : "author";
const logPath = process.env.EVAL_LOG;
const specs = functionSpecs(role === "author" ? AUTHOR_TOOLS : CALLER_TOOLS);

const reply = (id: unknown, result: unknown): void => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
};

interface Request {
  readonly id?: unknown;
  readonly method?: string;
  readonly params?: { readonly name?: string; readonly arguments?: unknown };
}

async function handle(request: Request): Promise<void> {
  switch (request.method) {
    case "initialize":
      return reply(request.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "workflow-author-eval", version: "1" },
      });
    case "tools/list":
      return reply(request.id, {
        tools: specs.map((spec) => ({
          name: spec.name,
          description: spec.description,
          inputSchema: spec.parameters,
        })),
      });
    case "tools/call": {
      const name = request.params?.name ?? "";
      const outcome = await executeEvalTool(
        role,
        name,
        JSON.stringify(request.params?.arguments ?? {}),
      );
      if (logPath !== undefined) {
        NodeFS.appendFileSync(
          logPath,
          `${JSON.stringify({ name, at: Date.now(), rejection: outcome.rejection ?? null, launched: outcome.launched === true, text: outcome.text.slice(0, 600) })}\n`,
        );
      }
      return reply(request.id, {
        content: [{ type: "text", text: outcome.text }],
        isError: outcome.rejection === "schema" || outcome.rejection === "tool",
      });
    }
    default:
      if (request.id !== undefined) reply(request.id, {});
  }
}

const lines = NodeReadline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  if (line.trim().length === 0) return;
  void handle(JSON.parse(line));
});
