/**
 * The model call behind `t3team.thread.search` question mode.
 *
 * Model id is the ROOT id, not the `no-thinking` alias: the alias route hard
 * rejects above 65536 tokens (`context_length_exceeded`, measured with a
 * 135,020-token request), while the root id accepted the same request 200 OK
 * in 29s and returned no reasoning content when thinking is disabled via
 * `chat_template_kwargs`.
 */

const GATEWAY_URL = "https://chat.nexplore.dev/v1/chat/completions";
const GATEWAY_FALLBACK_KEY = "nexplore-open-gateway";
export const T3TEAM_ASK_MODEL_ID = "qwen3.8-27b-nvfp4-mtp-192k";
/** Well under any turn budget — a slow gateway must never stall the caller. */
export const T3TEAM_ASK_TIMEOUT_MS = 60_000;

/**
 * Byte-identical on every call. The gateway caches the KV prefix, so anything
 * variable here (a thread id, a count, a timestamp) would destroy the cache
 * hit for every other ask. Variable content goes AFTER the transcript.
 */
export const T3TEAM_ASK_SYSTEM_PROMPT = [
  "You answer questions about a coding agent's work thread.",
  "",
  "You are given a slice of that thread's transcript. Each entry is rendered as",
  "`[position N | message|activity | label]` followed by its text.",
  "",
  "Rules:",
  "- Answer ONLY from the provided transcript slice. Never use outside knowledge",
  "  and never guess.",
  "- If the slice does not contain the answer, say so plainly and say what the",
  "  slice does cover, so the caller can widen the span.",
  "- Cite the entries you used by writing `position N` for each one.",
  "- Be brief and concrete. Prefer quoting the decisive line over paraphrasing.",
].join("\n");

export type ThreadAskRequest = {
  readonly question: string;
  readonly transcript: string;
};

export type ThreadAskFn = (request: ThreadAskRequest) => Promise<string>;

/**
 * Prompt order is load-bearing for cache reuse: fixed system prompt, then the
 * transcript slice in ascending position order, then the QUESTION LAST. The
 * question is the only variable part, so keeping it last leaves the whole
 * prefix cacheable. Moving the question earlier invalidates the cached prefix
 * on every single call — do not reorder these messages.
 */
export function buildThreadAskMessages(
  request: ThreadAskRequest,
): Array<{ role: string; content: string }> {
  return [
    { role: "system", content: T3TEAM_ASK_SYSTEM_PROMPT },
    { role: "user", content: `Transcript slice:\n\n${request.transcript}` },
    { role: "user", content: `Question: ${request.question}` },
  ];
}

function readAnswer(body: unknown): string {
  const choices = (body as { choices?: Array<{ message?: { content?: unknown } }> } | null)
    ?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("The model returned an empty answer.");
  }
  return content.trim();
}

/** Real gateway call. Injected as a dependency so the binding stays testable. */
export const askThreadQuestion: ThreadAskFn = async (request) => {
  const key = process.env["NEXPLORE_API_KEY"] ?? GATEWAY_FALLBACK_KEY;
  // A plain request to one external gateway, kept outside Effect so the ask
  // stays injectable as a promise (same shape as `t3team-tempo.ts`).
  // @effect-diagnostics-next-line globalFetch:off
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: T3TEAM_ASK_MODEL_ID,
      messages: buildThreadAskMessages(request),
      chat_template_kwargs: { enable_thinking: false },
      stream: false,
    }),
    signal: AbortSignal.timeout(T3TEAM_ASK_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`gateway HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return readAnswer(await response.json());
};
