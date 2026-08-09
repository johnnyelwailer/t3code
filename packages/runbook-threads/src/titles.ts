const CHILD_TITLE_MAX_LENGTH = 80;

/** Human-readable title for an agent call that did not provide an explicit label. */
export const workflowChildTitleFromPrompt = (prompt: string): string => {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return "Workflow task";
  if (normalized.length <= CHILD_TITLE_MAX_LENGTH) return normalized;
  return normalized.slice(0, CHILD_TITLE_MAX_LENGTH - 1).trimEnd() + "…";
};
