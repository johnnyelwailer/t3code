export type LocalProviderKind = "codex" | "claudeAgent";

export interface LocalProviderMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
}

export interface LocalProviderSession {
  readonly provider: LocalProviderKind;
  readonly nativeId: string;
  readonly cwd: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly messages: ReadonlyArray<LocalProviderMessage>;
}

const MAX_MESSAGES = 100;

const textFromContent = (content: unknown): string => {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = part as { text?: unknown };
      return typeof value.text === "string" ? value.text : "";
    })
    .join("\n")
    .trim();
};

const titleFrom = (messages: ReadonlyArray<LocalProviderMessage>, fallback: string): string => {
  const text = messages.find((message) => message.role === "user")?.text?.replace(/\s+/g, " ");
  return text ? text.slice(0, 90) : fallback;
};

export const parseCodexLocalSession = (raw: string): LocalProviderSession | null => {
  const messages: LocalProviderMessage[] = [];
  let nativeId = "";
  let cwd = "";
  let updatedAt = "";
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line) as {
        timestamp?: unknown;
        type?: unknown;
        payload?: { id?: unknown; cwd?: unknown; type?: unknown; role?: unknown; content?: unknown };
      };
      const timestamp = typeof row.timestamp === "string" ? row.timestamp : "";
      updatedAt = timestamp || updatedAt;
      if (row.type === "session_meta") {
        nativeId = typeof row.payload?.id === "string" ? row.payload.id : nativeId;
        cwd = typeof row.payload?.cwd === "string" ? row.payload.cwd : cwd;
      }
      if (row.type === "response_item" && row.payload?.type === "message") {
        const role = row.payload.role;
        const text = textFromContent(row.payload.content);
        if ((role === "user" || role === "assistant") && text) {
          messages.push({ role, text, createdAt: timestamp });
        }
      }
    } catch {}
  }
  if (!nativeId || !cwd) return null;
  return { provider: "codex", nativeId, cwd, title: titleFrom(messages, "Codex session"), updatedAt, messages: messages.slice(-MAX_MESSAGES) };
};

export const parseClaudeLocalSession = (raw: string): LocalProviderSession | null => {
  const messages: LocalProviderMessage[] = [];
  let nativeId = "";
  let cwd = "";
  let updatedAt = "";
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line) as {
        sessionId?: unknown; cwd?: unknown; timestamp?: unknown;
        message?: { role?: unknown; content?: unknown };
      };
      nativeId = typeof row.sessionId === "string" ? row.sessionId : nativeId;
      cwd = typeof row.cwd === "string" ? row.cwd : cwd;
      const timestamp = typeof row.timestamp === "string" ? row.timestamp : "";
      updatedAt = timestamp || updatedAt;
      const role = row.message?.role;
      const text = textFromContent(row.message?.content);
      if ((role === "user" || role === "assistant") && text) {
        messages.push({ role, text, createdAt: timestamp });
      }
    } catch {}
  }
  if (!nativeId || !cwd) return null;
  return { provider: "claudeAgent", nativeId, cwd, title: titleFrom(messages, "Claude session"), updatedAt, messages: messages.slice(-MAX_MESSAGES) };
};
