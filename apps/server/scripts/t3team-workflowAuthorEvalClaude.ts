// @effect-diagnostics nodeBuiltinImport:off globalDate:off - wall-clock latency is the measurement.
/**
 * One eval turn through the Claude Code CLI (`claude -p`), with the eval tools served by
 * `t3team-workflowAuthorEvalMcp.ts` and every built-in tool disabled, so a big model is measured on
 * the same tools and checks as the gateway models.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import type { TurnMetrics } from "./t3team-workflowAuthorEvalGateway.ts";

const MCP_SERVER = NodeURL.fileURLToPath(
  new URL("./t3team-workflowAuthorEvalMcp.ts", import.meta.url),
);

interface LoggedCall {
  readonly name: string;
  readonly at: number;
  readonly rejection: "schema" | "tool" | "check" | null;
  readonly launched: boolean;
  readonly text: string;
}

interface StreamEvent {
  readonly type?: string;
  readonly message?: {
    readonly content?: ReadonlyArray<{
      readonly type: string;
      readonly text?: string;
      readonly thinking?: string;
    }>;
    readonly usage?: {
      readonly input_tokens?: number;
      readonly cache_read_input_tokens?: number;
      readonly cache_creation_input_tokens?: number;
    };
  };
  readonly result?: string;
  readonly usage?: { readonly output_tokens?: number };
}

export async function runClaudeTurn(input: {
  readonly model: string;
  readonly role: "author" | "caller";
  readonly system: string;
  readonly prompt: string;
}): Promise<TurnMetrics> {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "wf-eval-claude-"));
  const log = NodePath.join(dir, "calls.jsonl");
  const config = NodePath.join(dir, "mcp.json");
  const systemFile = NodePath.join(dir, "system.md");
  NodeFS.writeFileSync(systemFile, input.system);
  NodeFS.writeFileSync(
    config,
    JSON.stringify({
      mcpServers: {
        eval: {
          command: process.execPath,
          args: [MCP_SERVER],
          env: { EVAL_ROLE: input.role, EVAL_LOG: log },
        },
      },
    }),
  );
  const started = Date.now();
  const events: StreamEvent[] = [];
  const env = { ...process.env };
  delete env.CLAUDECODE;
  const child = NodeChildProcess.spawn(
    "claude",
    [
      "-p",
      "--model",
      input.model,
      "--output-format",
      "stream-json",
      "--verbose",
      "--mcp-config",
      config,
      "--strict-mcp-config",
      "--tools",
      "",
      "--allowedTools",
      "mcp__eval",
      "--system-prompt-file",
      systemFile,
    ],
    { env, cwd: dir, stdio: ["pipe", "pipe", "pipe"] },
  );
  child.stdin.end(input.prompt);
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (let index = buffer.indexOf("\n"); index >= 0; index = buffer.indexOf("\n")) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.startsWith("{")) events.push(JSON.parse(line));
    }
  });
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  const calls: LoggedCall[] = NodeFS.existsSync(log)
    ? NodeFS.readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  NodeFS.rmSync(dir, { recursive: true, force: true });
  const assistant = events.filter((event) => event.type === "assistant");
  const parts = assistant.flatMap((event) => event.message?.content ?? []);
  const firstUsage = assistant[0]?.message?.usage;
  const final = events.find((event) => event.type === "result");
  const launch = calls.find((call) => call.launched);
  const firstRun = calls.find((call) => call.name === "t3_orchestration_run");
  const count = (kind: "schema" | "tool" | "check") =>
    calls.filter((call) => call.rejection === kind).length;
  return {
    promptChars: input.prompt.length + input.system.length,
    promptTokens:
      (firstUsage?.input_tokens ?? 0) +
      (firstUsage?.cache_read_input_tokens ?? 0) +
      (firstUsage?.cache_creation_input_tokens ?? 0),
    calls: assistant.length,
    toolCalls: calls.length,
    rejections: { schema: count("schema"), tool: count("tool"), check: count("check") },
    rejectionTexts: calls
      .filter((call) => call.rejection !== null)
      .map((call) => `${call.name}: ${call.text}`),
    launched: launch !== undefined,
    firstSubmitAccepted: firstRun === undefined ? null : firstRun.launched,
    reasoningChars: parts.reduce((sum, part) => sum + (part.thinking?.length ?? 0), 0),
    contentChars: parts.reduce(
      (sum, part) => sum + (part.type === "text" ? (part.text?.length ?? 0) : 0),
      0,
    ),
    completionTokens: final?.usage?.output_tokens ?? 0,
    finishReasons: [],
    msToLaunch: launch === undefined ? null : launch.at - started,
    finalText: final?.result ?? "",
    ...(exitCode === 0 ? {} : { error: `claude exited ${exitCode}` }),
  };
}
