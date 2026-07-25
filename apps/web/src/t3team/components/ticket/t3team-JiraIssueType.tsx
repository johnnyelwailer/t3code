import { useState } from "react";

import { cn } from "~/t3team/lib/t3team-utils";

export type JiraIssueTypeKey = "task" | "story" | "bug" | "epic" | "subtask" | "issue";

export type JiraIssueTypeVisual = {
  key: JiraIssueTypeKey;
  label: string;
  /**
   * Semantic token classes rather than a literal colour, so the glyph follows the active workspace
   * theme. A pack can rebind `--info`, `--success`, `--destructive` and the rest at runtime
   * (`t3team-packAppearance.ts`), which a hardcoded hex would silently ignore.
   */
  toneClassName: string;
};

const ISSUE_TYPE_ALIASES: Record<JiraIssueTypeKey, ReadonlyArray<string>> = {
  task: ["task"],
  story: ["story", "user story"],
  bug: ["bug", "defect"],
  epic: ["epic"],
  subtask: ["sub-task", "subtask", "sub task"],
  issue: ["issue", "ticket", "work item", "workitem"],
};

/**
 * Atlassian's own icon palette (Blue600 / Lime600 / Red700 / Purple600) mapped onto our semantic
 * tokens: the meaning carries over, the literal colours do not, so a themed workspace stays coherent.
 * Epic has no semantic equivalent, so it takes `primary` — the theme's own accent.
 *
 * Drawn as a flat glyph rather than a filled square. A filled square would need a fixed foreground
 * colour, which is exactly what a theme cannot rebind, and — with the Task type's checkmark inside
 * it — a tinted rounded square reads as a checkbox, which is a control this is not.
 */
const ISSUE_TYPE_VISUALS: Record<JiraIssueTypeKey, JiraIssueTypeVisual> = {
  task: { key: "task", label: "Task", toneClassName: "bg-info text-background" },
  story: { key: "story", label: "Story", toneClassName: "bg-success text-background" },
  bug: { key: "bug", label: "Bug", toneClassName: "bg-destructive text-background" },
  epic: { key: "epic", label: "Epic", toneClassName: "bg-primary text-background" },
  subtask: {
    key: "subtask",
    label: "Subtask",
    toneClassName: "bg-muted-foreground/70 text-background",
  },
  issue: { key: "issue", label: "Issue", toneClassName: "bg-muted-foreground/70 text-background" },
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveJiraIssueType(issueType: string | undefined): JiraIssueTypeVisual {
  if (!issueType) return ISSUE_TYPE_VISUALS.issue;
  const normalized = normalizeText(issueType);

  for (const [key, aliases] of Object.entries(ISSUE_TYPE_ALIASES) as Array<
    [JiraIssueTypeKey, ReadonlyArray<string>]
  >) {
    if (aliases.some((alias) => alias === normalized)) {
      return ISSUE_TYPE_VISUALS[key];
    }
  }

  return {
    key: "issue",
    label: issueType,
    toneClassName: ISSUE_TYPE_VISUALS.issue.toneClassName,
  };
}

function IssueGlyph({ type }: { type: JiraIssueTypeKey }) {
  switch (type) {
    case "task":
      return (
        <svg viewBox="0 0 12 12" className="size-3/4" aria-hidden="true">
          <path
            d="M2.5 6.1 4.6 8.2 9.4 3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "story":
      return (
        <svg viewBox="0 0 12 12" className="size-3/4" aria-hidden="true">
          <path d="M3 2.2h6v7.6L6 7.9 3 9.8Z" fill="currentColor" />
        </svg>
      );
    case "bug":
      return (
        <svg viewBox="0 0 12 12" className="size-3/4" aria-hidden="true">
          <path
            d="M6 3c1.2 0 2 .8 2 2v2.2c0 1.2-.8 2-2 2s-2-.8-2-2V5c0-1.2.8-2 2-2Zm0-1.7v1m-2.8 2.2 1 .6m4.6-.6-1 .6m-4.6 2.3 1-.4m4.6.4-1-.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "epic":
      return (
        <svg viewBox="0 0 12 12" className="size-3/4" aria-hidden="true">
          <path d="M6.8 1.8 3.8 6h2.1l-.7 4.2L8.2 6H6.1z" fill="currentColor" />
        </svg>
      );
    case "subtask":
      return (
        <svg viewBox="0 0 12 12" className="size-3/4" aria-hidden="true">
          <path
            d="M3 2.6h3.3a1.3 1.3 0 0 1 1.3 1.3v.7H9m0 0L7.7 3.3M9 4.6 7.7 5.9M5 9.2h4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 12 12" className="size-3/4" aria-hidden="true">
          <circle cx="6" cy="6" r="2" fill="currentColor" />
        </svg>
      );
  }
}

export function JiraIssueTypeIcon({
  issueType,
  issueTypeIconUrl,
  className,
}: {
  issueType: string | undefined;
  issueTypeIconUrl?: string | undefined;
  className?: string | undefined;
}) {
  const visual = resolveJiraIssueType(issueType);
  const [officialIconFailed, setOfficialIconFailed] = useState(false);
  const hasOfficialIcon = typeof issueTypeIconUrl === "string" && issueTypeIconUrl.length > 0;

  /*
    Jira's icon URLs are per-site and not always reachable from here — a site can restrict them,
    the avatar id can be stale, or the request can simply fail. Without a fallback the row was left
    showing a broken image, which is how "some icons don't load" looked. Our own glyph carries the
    same meaning, so fall back to it rather than to nothing.
  */
  if (hasOfficialIcon && !officialIconFailed) {
    return (
      <img
        src={issueTypeIconUrl}
        alt={visual.label}
        title={visual.label}
        className={cn("size-4 shrink-0 rounded-sm object-contain", className)}
        loading="lazy"
        decoding="async"
        onError={() => setOfficialIconFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      title={visual.label}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-sm",
        visual.toneClassName,
        className,
      )}
    >
      <IssueGlyph type={visual.key} />
    </span>
  );
}

export function readIssueTypeFromSnapshotFields(fields: unknown): string | undefined {
  if (!fields || typeof fields !== "object") return undefined;
  const value = (fields as Record<string, unknown>).type;
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function readIssueTypeIconUrlFromSnapshotFields(fields: unknown): string | undefined {
  if (!fields || typeof fields !== "object") return undefined;
  const value = (fields as Record<string, unknown>).typeIconUrl;
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
