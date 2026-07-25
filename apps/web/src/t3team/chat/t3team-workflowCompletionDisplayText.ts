export function workflowCompletionDisplayText(messageId: string, text: string): string {
  if (!messageId.startsWith("t3team-wf-result:")) return text;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return text;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return text;
    const record = parsed as Record<string, unknown>;
    for (const key of ["summary", "message", "text", "result"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
    const readable = Object.entries(record)
      .filter(
        ([, value]) =>
          ["string", "number", "boolean"].includes(typeof value) ||
          (Array.isArray(value) &&
            value.every((item) => ["string", "number", "boolean"].includes(typeof item))),
      )
      .map(([key, value]) => {
        const label = key.replaceAll(/([a-z])([A-Z])/g, "$1 $2");
        const title = label.charAt(0).toUpperCase() + label.slice(1);
        return `**${title}:** ${Array.isArray(value) ? value.join(", ") : String(value)}`;
      });
    return readable.length > 0 ? readable.join("\n") : "Workflow completed.";
  } catch {
    return text;
  }
}
