export const ADDED_CONTEXT_HEADING = "### Added Context:";
export const ADDED_CONTEXT_FOOTER = "Use the referenced workspace files for full context details.";

export function inferContextAttachmentKindFromType(typeValue: string | undefined): string {
  const value = (typeValue ?? "").toLowerCase();
  if (value.includes("jira") || value.includes("ticket")) {
    return "jira-work-item";
  }
  if (value.includes("github")) {
    return "github-activity";
  }
  return "context";
}

export function normalizeContextAttachmentKind(kindValue: string | undefined): string | undefined {
  const value = (kindValue ?? "").trim().toLowerCase();
  if (!value || value === "t3team-directory-bundle") {
    return undefined;
  }
  return value;
}
