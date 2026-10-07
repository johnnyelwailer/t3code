import type { DigestChangeRequest } from "~/t3team/t3team-projectMyWorkDigestPlan";

type DigestPrStateVariant = "error" | "warning" | "success" | "secondary" | "outline";

/**
 * PR lifecycle states as the digest reads them. Tones follow the app's PR surface: a verdict the
 * viewer owes is amber, a negative verdict or broken CI is red, earned states are green, neutral
 * states stay quiet.
 */
export const DIGEST_PR_STATE: Record<
  DigestChangeRequest["state"],
  {
    readonly label: string;
    readonly variant: DigestPrStateVariant;
  }
> = {
  draft: { label: "draft", variant: "secondary" },
  open: { label: "open", variant: "secondary" },
  "needs-you": { label: "your review", variant: "warning" },
  "changes-requested": { label: "changes requested", variant: "error" },
  "ci-failing": { label: "ci failing", variant: "error" },
  approved: { label: "approved", variant: "success" },
  merged: { label: "merged", variant: "outline" },
};

/** The chip's own tint when its state asks something of the viewer. */
export const DIGEST_PR_ACTION_RING: Partial<Record<DigestPrStateVariant, string>> = {
  error: "bg-destructive/8 ring-destructive/40",
  warning: "bg-warning/8 ring-warning/40",
};

// Owed action first (broken, then the viewer's review), drafts last.
const PR_RANK = { error: 0, warning: 1, success: 2, secondary: 2, outline: 2 } as const;
export const digestPrRank = (pr: DigestChangeRequest) =>
  pr.state === "draft" ? 3 : PR_RANK[DIGEST_PR_STATE[pr.state].variant];
