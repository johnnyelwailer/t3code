/** One non-streaming chat completion against the Nexplore gateway (OpenAI-compatible). */

const GATEWAY_URL = "https://chat.nexplore.dev/v1/chat/completions";
const GATEWAY_FALLBACK_KEY = "nexplore-open-gateway";

export type NexploreChatMessage = { readonly role: string; readonly content: string };

export type NexploreChatRequest = {
  readonly model: string;
  readonly messages: ReadonlyArray<NexploreChatMessage>;
  readonly timeoutMs: number;
  /** Extra body fields, e.g. `chat_template_kwargs` to disable thinking on a root model id. */
  readonly body?: Readonly<Record<string, unknown>>;
};

function readAnswer(body: unknown): string {
  const choices = (body as { choices?: Array<{ message?: { content?: unknown } }> } | null)
    ?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("The model returned an empty answer.");
  }
  return content.trim();
}

/** A plain request to one external gateway, kept outside Effect so callers can inject it. */
export async function postNexploreChat(request: NexploreChatRequest): Promise<string> {
  const key = process.env["NEXPLORE_API_KEY"] ?? GATEWAY_FALLBACK_KEY;
  // @effect-diagnostics-next-line globalFetch:off
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      ...request.body,
      stream: false,
    }),
    signal: AbortSignal.timeout(request.timeoutMs),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`gateway HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return readAnswer(await response.json());
}
