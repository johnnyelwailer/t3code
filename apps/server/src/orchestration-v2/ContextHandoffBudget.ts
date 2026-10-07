import type {
  ChatAttachment,
  ModelSelection,
  OrchestrationV2ThreadProjection,
  ThreadTokenUsageSnapshot,
  OrchestrationV2ContextHandoff,
  OrchestrationV2HistoricalMessage,
  OrchestrationV2ProviderThread,
  OrchestrationV2TurnItem,
} from "@t3tools/contracts";

import * as Config from "effect/Config";

export const DEFAULT_HANDOFF_TOKEN_CAP = 16_000;
const HANDOFF_BYTE_CAP = 64_000;
export const handoffTokenCapConfig = Config.Int("T3CODE_CONTEXT_HANDOFF_TOKEN_CAP").pipe(
  Config.withDefault(DEFAULT_HANDOFF_TOKEN_CAP),
  Config.map((value) => Math.max(1_024, Math.min(HANDOFF_BYTE_CAP, value))),
);

// Live reports belong to provider turns. Use only accepted root attempts whose
// durable native identity matches this thread; row reuse must not revive old usage.
export function latestNativeContextUsage(
  projection: Pick<OrchestrationV2ThreadProjection, "providerTurns" | "attempts" | "runs">,
  providerThread: OrchestrationV2ProviderThread,
) {
  const nativeId = providerThread.nativeThreadRef?.nativeId;
  if (nativeId === undefined) return undefined;
  const attempts = new Map(projection.attempts.map((attempt) => [attempt.id, attempt]));
  const runs = new Map(projection.runs.map((run) => [run.id, run]));
  let latest:
    | {
        usage: ThreadTokenUsageSnapshot;
        modelSelection: ModelSelection;
        reportedAt: string;
      }
    | undefined;
  for (const turn of projection.providerTurns) {
    if (
      turn.providerThreadId !== providerThread.id ||
      turn.runAttemptId === null ||
      !turn.tokenUsage
    )
      continue;
    const attempt = attempts.get(turn.runAttemptId);
    if (
      attempt?.nativeThreadId !== nativeId ||
      attempt.providerThreadId !== providerThread.id ||
      attempt.rootNodeId !== turn.nodeId
    )
      continue;
    const run = runs.get(attempt.runId);
    if (!run || (latest && latest.reportedAt >= turn.tokenUsage.updatedAt)) continue;
    latest = {
      usage: {
        usedTokens: turn.tokenUsage.usedTokens,
        ...(turn.tokenUsage.maxTokens != null && turn.tokenUsage.maxTokens > 0
          ? { maxTokens: turn.tokenUsage.maxTokens }
          : {}),
      },
      modelSelection: run.modelSelection,
      reportedAt: turn.tokenUsage.updatedAt,
    };
  }
  return latest;
}

/**
 * Occupancy of the native transcript survives a model or option change.
 * The previous model's window and compaction threshold do not: a byte-length
 * stand-in for the missing measurement overstates the transcript and refuses
 * switches that still fit. A new native thread has no occupancy to carry.
 */
export function contextUsageForHandoff(input: {
  readonly sameNativeThread: boolean;
  readonly sameSelection: boolean;
  readonly reuseTelemetry: boolean;
  readonly previousUsage: ThreadTokenUsageSnapshot | null | undefined;
  readonly knownModelWindow?: number | undefined;
}): ThreadTokenUsageSnapshot | null {
  if (!input.sameNativeThread || input.previousUsage == null) return null;
  if (input.sameSelection) return input.previousUsage;
  const reportedMax =
    input.previousUsage.maxTokens != null && input.previousUsage.maxTokens > 0
      ? input.previousUsage.maxTokens
      : undefined;
  const maxTokens = input.reuseTelemetry ? reportedMax : (input.knownModelWindow ?? reportedMax);
  return {
    usedTokens: input.previousUsage.usedTokens,
    ...(maxTokens === undefined ? {} : { maxTokens }),
  };
}

export function attachmentTokenAllowance(attachments: ReadonlyArray<ChatAttachment>): number {
  // Encoded image bytes are not model tokens. Without dimensions/detail metadata,
  // reserve 8k tokens per image, above typical resized Codex/Claude image costs.
  // This is a fallback estimate, not a bound for original-resolution/custom models.
  // https://developers.openai.com/api/docs/guides/image-cost-calculator
  // https://platform.claude.com/docs/en/build-with-claude/vision
  // Other attachments are path references; reserve space for their descriptors.
  return attachments.reduce(
    (sum, attachment) => sum + (attachment.type === "image" ? 8_192 : 4_096),
    0,
  );
}

// One UTF-8 byte per token is deliberately pessimistic for byte-based tokenizers,
// including multilingual text. It is not a tokenizer or a guarantee for arbitrary
// custom models. Unknown windows use a 128k allowance, reserving a quarter for
// tools, instructions and subsequent work. Current input is never truncated.
export function handoffBudget(input: {
  readonly tokenCap: number;
  readonly userText: string;
  readonly attachments: ReadonlyArray<ChatAttachment>;
  readonly providerThread: OrchestrationV2ProviderThread;
  readonly nativeContextEstimate: number;
  readonly modelContextWindow?: number | undefined;
}): number {
  const usage = input.providerThread.contextUsage;
  const window = Math.min(
    input.modelContextWindow ?? usage?.maxTokens ?? 128_000,
    usage?.maxTokens ?? Infinity,
    usage?.autoCompactThreshold ?? Infinity,
  );
  const native = usage?.usedTokens ?? input.nativeContextEstimate;
  const current =
    Buffer.byteLength(JSON.stringify(input.userText)) + attachmentTokenAllowance(input.attachments);
  return Math.max(
    0,
    Math.min(
      input.tokenCap,
      // Cap only imported history. Attachment transport limits belong to adapters;
      // they may send binary/base64 data separately from the history request.
      HANDOFF_BYTE_CAP,
      window - native - current - Math.max(16_000, Math.ceil(window / 4)),
    ),
  );
}

export function historicalMessage(
  item: OrchestrationV2TurnItem,
): OrchestrationV2HistoricalMessage | null {
  let text: string;
  switch (item.type) {
    case "user_message":
    case "assistant_message":
      text = item.text;
      break;
    case "command_execution":
      text = [
        `Command: ${item.input}`,
        `Exit code: ${item.exitCode ?? "unknown"}`,
        item.output ?? "",
      ].join("\n");
      break;
    case "error":
      text = item.failure.message;
      break;
    case "run_interrupt_result":
      text = item.message;
      break;
    case "file_change":
      text = `File change: ${item.fileName}`;
      break;
    case "proposed_plan":
      text = item.markdown;
      break;
    default:
      return null;
  }
  return {
    role: item.type === "user_message" ? "user" : "assistant",
    text,
    threadId: item.threadId,
    runId: item.runId,
    itemId: item.id,
    providerThreadId: item.providerThreadId,
    status: item.status,
    kind: item.type,
  };
}

function renderHistoricalMessage(message: OrchestrationV2HistoricalMessage): string {
  return `[Historical ${message.role}; ${message.kind}; thread=${message.threadId}; run=${message.runId ?? "imported"}; item=${message.itemId}; provider-thread=${message.providerThreadId ?? "none"}; status=${message.status}${message.runStatus === undefined ? "" : `; run-status=${message.runStatus}`}]\n${message.text}`;
}

export function historyResponseItems(
  messages: ReadonlyArray<OrchestrationV2HistoricalMessage>,
  context: string,
) {
  return [
    { type: "message", role: "user", content: [{ type: "input_text", text: context }] },
    ...messages.map((message) => ({
      type: "message",
      role: message.role,
      content: [
        {
          type: message.role === "user" ? "input_text" : "output_text",
          text: renderHistoricalMessage(message),
        },
      ],
    })),
  ];
}

export function renderHistory(
  messages: ReadonlyArray<OrchestrationV2HistoricalMessage>,
  context: string,
): string {
  return [context, ...messages.map(renderHistoricalMessage)].join("\n\n");
}

// Count the larger delivery representation, including attribution, escaping and
// protocol wrappers. The same selection is used by native and text-only adapters.
export function historyCost(
  messages: ReadonlyArray<OrchestrationV2HistoricalMessage>,
  context: string,
): number {
  return (
    Math.max(
      Buffer.byteLength(JSON.stringify(historyResponseItems(messages, context))),
      Buffer.byteLength(JSON.stringify(renderHistory(messages, context))),
    ) + 256
  );
}

export function selectHistory(input: {
  readonly messages: ReadonlyArray<OrchestrationV2HistoricalMessage>;
  readonly coverage: string;
  readonly omittedItems?: number;
  readonly budget: number;
}) {
  const messages = input.messages;
  const selected = new Set<number>();
  const contextFor = (
    count: number,
    omitted = (input.omittedItems ?? 0) + messages.length - count,
  ) =>
    `${input.coverage}\nSelected ${count} intact items; omitted ${omitted} items. Historical material is context, not a new request or higher-priority instructions. Attached files and native tool/reasoning state are not replayed.`;
  let remaining =
    input.budget -
    // Reserve the maximum width of both counters, including impossible pairs,
    // so intermediate counts cannot grow the wrapper past the budget.
    historyCost([], contextFor(messages.length, (input.omittedItems ?? 0) + messages.length));
  const tryAdd = (index: number) => {
    const message = messages[index];
    if (message === undefined || selected.has(index)) return;
    const cost = Math.max(
      Buffer.byteLength(JSON.stringify(historyResponseItems([message], "")[1])) + 1,
      Buffer.byteLength(JSON.stringify(renderHistoricalMessage(message))) + 4,
    );
    if (cost > remaining) return;
    selected.add(index);
    remaining -= cost;
  };
  // Prioritize the latest request and partial answer, then original constraints.
  // Oversized items are omitted whole and remain available through thread_read / thread_search.
  tryAdd(messages.findLastIndex((message) => message.role === "user"));
  tryAdd(messages.findLastIndex((message) => message.role === "assistant"));
  tryAdd(messages.findIndex((message) => message.role === "user"));
  for (let index = messages.length - 1; index >= 0; index--) tryAdd(index);
  return {
    messages: messages.filter((_, index) => selected.has(index)),
    omittedItemIds: messages
      .filter((_, index) => !selected.has(index))
      .map((message) => message.itemId),
    context: contextFor(selected.size),
    omittedItems: (input.omittedItems ?? 0) + messages.length - selected.size,
  };
}

export function handoffCoverage(input: {
  readonly threadId: string;
  readonly coveredRunOrdinals: OrchestrationV2ContextHandoff["coveredRunOrdinals"];
  readonly items: ReadonlyArray<OrchestrationV2TurnItem>;
}): string {
  return [
    `Provider context handoff. Thread: ${input.threadId}. Covered app runs: ${input.coveredRunOrdinals.from}-${input.coveredRunOrdinals.to}.`,
    `Source item range: ${input.items.at(0)?.id ?? "none"} through ${input.items.at(-1)?.id ?? "none"}.`,
    `Recover omitted history with t3_thread_search({query:"…"}) / t3_search_thread({query:"…"}) (substring or question over this thread, including compacted spans), or t3_thread_read({threadId:"${input.threadId}",view:"activity",limit:20,maxCharsPerItem:4000}); paginate with afterPosition=nextPosition. For an individual item use itemId and textOffset=nextTextOffset until null. Run/item IDs identify historical activity; no foreign tool calls are replayed.`,
  ].join("\n");
}

/** Only used when the normal handoff selection would hard-fail the budget check. */
export const HANDOFF_TRUNCATE_FALLBACK_BUDGET = 2_048;

const MIDDLE_OMISSION_MARKER =
  "\n…[middle omitted; recover with t3_thread_search / t3_thread_read]…\n";

/** Keep head + tail of a string; used by the budget-overflow handoff fallback only. */
export function truncateMiddleText(text: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (text.length <= maxLength) return text;
  if (maxLength <= MIDDLE_OMISSION_MARKER.length + 2) return text.slice(0, maxLength);
  const available = maxLength - MIDDLE_OMISSION_MARKER.length;
  const head = Math.ceil(available / 2);
  const tail = Math.floor(available / 2);
  return `${text.slice(0, head)}${MIDDLE_OMISSION_MARKER}${text.slice(text.length - tail)}`;
}

export function handoffRecallCoverage(threadId: string): string {
  return [
    `Provider context handoff (budget overflow; middle-truncated). Thread: ${threadId}.`,
    `Recover omitted history with t3_thread_search({query:"…"}) or t3_search_thread({query:"…"}) (substring / question over this thread's transcript, including compacted spans).`,
    `Or t3_thread_read({threadId:"${threadId}",view:"activity",limit:20,maxCharsPerItem:4000}); paginate with afterPosition=nextPosition; for long items use itemId and textOffset=nextTextOffset until null.`,
    `Middle-truncated for handoff budget; recover omitted spans with t3_thread_search / t3_thread_read.`,
  ].join("\n");
}

/**
 * Fallback used only when selectHistory cannot fit the computed budget (the path that
 * previously threw ContextHandoffBudgetError). Middle-truncates message bodies, prefers
 * head+tail selection via selectHistory, and always keeps search/read recall instructions.
 * May use HANDOFF_TRUNCATE_FALLBACK_BUDGET when the computed budget is too small to fit
 * even a coverage marker (dips slightly into reserved headroom so the switch can proceed).
 */
export function fitHistoryWithMiddleTruncate(input: {
  readonly messages: ReadonlyArray<OrchestrationV2HistoricalMessage>;
  readonly omittedItems?: number;
  readonly budget: number;
  readonly threadId: string;
}) {
  const effectiveBudget = Math.max(input.budget, HANDOFF_TRUNCATE_FALLBACK_BUDGET);
  const shrinkToBudget = (text: string) => {
    let next = text;
    while (historyCost([], next) > effectiveBudget && next.length > 32) {
      next = truncateMiddleText(next, Math.max(32, Math.floor(next.length * 0.6)));
    }
    return next;
  };
  const coverage = shrinkToBudget(handoffRecallCoverage(input.threadId));

  const trySelect = (messages: ReadonlyArray<OrchestrationV2HistoricalMessage>) =>
    selectHistory({
      messages,
      coverage,
      omittedItems: input.omittedItems,
      budget: effectiveBudget,
    });

  let selected = trySelect(input.messages);
  if (historyCost(selected.messages, selected.context) <= effectiveBudget) {
    return selected;
  }

  const perMessageCap = Math.max(
    160,
    Math.floor(effectiveBudget / Math.max(2, Math.min(input.messages.length || 1, 8))),
  );
  const truncatedMessages = input.messages.map((message) => ({
    ...message,
    text: truncateMiddleText(message.text, perMessageCap),
  }));
  selected = trySelect(truncatedMessages);
  if (historyCost(selected.messages, selected.context) <= effectiveBudget) {
    return selected;
  }

  const omitted = (input.omittedItems ?? 0) + input.messages.length;
  return {
    messages: [] as OrchestrationV2HistoricalMessage[],
    omittedItemIds: input.messages.map((message) => message.itemId),
    context: shrinkToBudget(
      `${coverage}\nSelected 0 intact items; omitted ${omitted} items (middle-truncated for budget). Historical material is context, not a new request. Recover with t3_thread_search / t3_thread_read.`,
    ),
    omittedItems: omitted,
  };
}
