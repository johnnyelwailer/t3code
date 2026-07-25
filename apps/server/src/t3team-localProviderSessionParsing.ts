export type LocalProviderKind = "codex" | "claudeAgent";

export interface LocalProviderMessage {
  readonly nativeIndex: number;
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
  readonly branch: string | null;
  readonly model: string | null;
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
  let branch: string | null = null;
  let model: string | null = null;
  let messageIndex = 0;
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line) as {
        timestamp?: unknown;
        type?: unknown;
        payload?: {
          id?: unknown;
          cwd?: unknown;
          gitBranch?: unknown;
          git_branch?: unknown;
          type?: unknown;
          role?: unknown;
          content?: unknown;
          model?: unknown;
        };
      };
      const timestamp = typeof row.timestamp === "string" ? row.timestamp : "";
      updatedAt = timestamp || updatedAt;
      if (row.type === "session_meta") {
        nativeId = typeof row.payload?.id === "string" ? row.payload.id : nativeId;
        cwd = typeof row.payload?.cwd === "string" ? row.payload.cwd : cwd;
        const candidateBranch = row.payload?.gitBranch ?? row.payload?.git_branch;
        branch =
          typeof candidateBranch === "string" && candidateBranch.trim() ? candidateBranch : branch;
      }
      if (row.type === "turn_context" && typeof row.payload?.model === "string") {
        model = row.payload.model.trim() || model;
      }
      if (row.type === "response_item" && row.payload?.type === "message") {
        const role = row.payload.role;
        const text = textFromContent(row.payload.content);
        if ((role === "user" || role === "assistant") && text) {
          messages.push({ nativeIndex: messageIndex++, role, text, createdAt: timestamp });
        }
      }
    } catch {}
  }
  if (!nativeId || !cwd) return null;
  return {
    provider: "codex",
    nativeId,
    cwd,
    title: titleFrom(messages, "Codex session"),
    updatedAt,
    branch,
    model,
    messages: messages.slice(-MAX_MESSAGES),
  };
};

export const parseClaudeLocalSession = (raw: string): LocalProviderSession | null => {
  const messages: LocalProviderMessage[] = [];
  let nativeId = "";
  let cwd = "";
  let updatedAt = "";
  let branch: string | null = null;
  let model: string | null = null;
  let messageIndex = 0;
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line) as {
        sessionId?: unknown;
        cwd?: unknown;
        timestamp?: unknown;
        gitBranch?: unknown;
        message?: { role?: unknown; content?: unknown; model?: unknown };
      };
      nativeId = typeof row.sessionId === "string" ? row.sessionId : nativeId;
      cwd = typeof row.cwd === "string" ? row.cwd : cwd;
      const timestamp = typeof row.timestamp === "string" ? row.timestamp : "";
      updatedAt = timestamp || updatedAt;
      branch = typeof row.gitBranch === "string" && row.gitBranch.trim() ? row.gitBranch : branch;
      model =
        typeof row.message?.model === "string" && row.message.model.trim()
          ? row.message.model
          : model;
      const role = row.message?.role;
      const text = textFromContent(row.message?.content);
      if ((role === "user" || role === "assistant") && text) {
        messages.push({ nativeIndex: messageIndex++, role, text, createdAt: timestamp });
      }
    } catch {}
  }
  if (!nativeId || !cwd) return null;
  return {
    provider: "claudeAgent",
    nativeId,
    cwd,
    title: titleFrom(messages, "Claude session"),
    updatedAt,
    branch,
    model,
    messages: messages.slice(-MAX_MESSAGES),
  };
};
