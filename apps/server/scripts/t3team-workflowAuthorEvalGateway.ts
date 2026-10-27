// @effect-diagnostics globalDate:off globalFetch:off - a manual eval measuring a live HTTP model's latency.
/**
 * One agent turn against an OpenAI-compatible endpoint (the Nexplore gateway by default): the model
 * calls tools until it stops calling them, exactly like a provider turn. Output budgets mirror the
 * Nexplore pack's tiers, where reasoning and the answer share one `max_tokens`.
 */
import * as Schema from "effect/Schema";

import {
  executeEvalTool,
  functionSpecs,
  type FunctionSpec,
  type Rejection,
} from "./t3team-workflowAuthorEvalTools.ts";

/** The pack's per-tier output budget (thinking + answer) and reasoning effort. */
const TIERS: Record<string, { readonly maxTokens: number; readonly effort?: string }> = {
  "no-thinking": { maxTokens: 8_192 },
  low: { maxTokens: 16_384, effort: "low" },
  medium: { maxTokens: 8_192, effort: "medium" },
  high: { maxTokens: 16_384, effort: "high" },
};

export interface TurnMetrics {
  promptChars: number;
  promptTokens: number;
  calls: number;
  toolCalls: number;
  rejections: Record<Rejection, number>;
  rejectionTexts: string[];
  launched: boolean;
  firstSubmitAccepted: boolean | null;
  reasoningChars: number;
  contentChars: number;
  completionTokens: number;
  finishReasons: string[];
  msToLaunch: number | null;
  finalText: string;
  error?: string;
}

const ToolCall = Schema.Struct({
  id: Schema.String,
  function: Schema.Struct({ name: Schema.String, arguments: Schema.String }),
});
const ReplyMessage = Schema.Struct({
  content: Schema.NullishOr(Schema.String),
  reasoning_content: Schema.optional(Schema.NullishOr(Schema.String)),
  tool_calls: Schema.optional(Schema.NullishOr(Schema.Array(ToolCall))),
});
const Completion = Schema.Struct({
  choices: Schema.optional(
    Schema.Array(Schema.Struct({ message: ReplyMessage, finish_reason: Schema.String })),
  ),
  usage: Schema.optional(
    Schema.Struct({
      prompt_tokens: Schema.optional(Schema.Number),
      completion_tokens: Schema.optional(Schema.Number),
    }),
  ),
});

interface ChatMessage {
  readonly role: string;
  readonly content: string | null;
  readonly tool_calls?: ReadonlyArray<typeof ToolCall.Type>;
  readonly tool_call_id?: string;
}

const MAX_CALLS = 16;

/** A validate result's `errors`, or the raw text for every other refusal. */
const findingsOf = (text: string): string => {
  try {
    const parsed: { errors?: ReadonlyArray<{ message: string }> } = JSON.parse(text);
    return parsed.errors?.map((item) => item.message).join(" | ") ?? text;
  } catch {
    return text;
  }
};

async function complete(input: {
  readonly baseUrl: string;
  readonly model: string;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly tools: ReadonlyArray<FunctionSpec>;
}) {
  const tier = TIERS[input.model] ?? { maxTokens: 16_384 };
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.NEXPLORE_API_KEY ?? "nexplore"}`,
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: tier.maxTokens,
      ...(tier.effort === undefined ? {} : { reasoning_effort: tier.effort }),
      messages: input.messages,
      tools: input.tools.map((fn) => ({ type: "function", function: fn })),
    }),
    signal: AbortSignal.timeout(20 * 60_000),
  });
  if (!response.ok)
    throw new Error(`gateway ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = Schema.decodeUnknownSync(Completion)(await response.json());
  const choice = body.choices?.[0];
  if (choice === undefined) throw new Error("gateway returned no choice");
  return { choice, usage: body.usage ?? {} };
}

export async function runEvalTurn(input: {
  readonly baseUrl: string;
  readonly model: string;
  readonly role: "author" | "caller";
  readonly system?: string | undefined;
  readonly prompt: string;
  readonly toolNames: Parameters<typeof functionSpecs>[0];
}): Promise<TurnMetrics> {
  const started = Date.now();
  const tools = functionSpecs(input.toolNames);
  const messages: ChatMessage[] = [
    ...(input.system === undefined ? [] : [{ role: "system", content: input.system }]),
    { role: "user", content: input.prompt },
  ];
  const metrics: TurnMetrics = {
    promptChars: input.prompt.length + JSON.stringify(tools).length + (input.system?.length ?? 0),
    promptTokens: 0,
    calls: 0,
    toolCalls: 0,
    rejections: { schema: 0, tool: 0, check: 0 },
    rejectionTexts: [],
    launched: false,
    firstSubmitAccepted: null,
    reasoningChars: 0,
    contentChars: 0,
    completionTokens: 0,
    finishReasons: [],
    msToLaunch: null,
    finalText: "",
  };
  try {
    while (metrics.calls < MAX_CALLS) {
      const { choice, usage } = await complete({ ...input, messages, tools });
      metrics.calls += 1;
      if (metrics.calls === 1) metrics.promptTokens = usage.prompt_tokens ?? 0;
      metrics.completionTokens += usage.completion_tokens ?? 0;
      metrics.finishReasons.push(choice.finish_reason);
      metrics.reasoningChars += choice.message.reasoning_content?.length ?? 0;
      metrics.contentChars += choice.message.content?.length ?? 0;
      const calls = choice.message.tool_calls ?? [];
      messages.push({
        role: "assistant",
        content: choice.message.content ?? "",
        tool_calls: calls,
      });
      if (calls.length === 0) {
        metrics.finalText = choice.message.content ?? "";
        break;
      }
      for (const call of calls) {
        metrics.toolCalls += 1;
        const outcome = await executeEvalTool(
          input.role,
          call.function.name,
          call.function.arguments,
        );
        if (outcome.rejection !== undefined) {
          metrics.rejections[outcome.rejection] += 1;
          metrics.rejectionTexts.push(
            `${call.function.name}: ${findingsOf(outcome.text).slice(0, 600)}`,
          );
        }
        if (call.function.name === "t3_orchestration_run" && metrics.firstSubmitAccepted === null) {
          metrics.firstSubmitAccepted = outcome.launched === true;
        }
        if (outcome.launched === true && !metrics.launched) {
          metrics.launched = true;
          metrics.msToLaunch = Date.now() - started;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: outcome.text });
      }
    }
  } catch (error) {
    metrics.error = error instanceof Error ? error.message : String(error);
  }
  return metrics;
}
