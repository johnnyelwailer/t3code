import { MarkGithubIcon } from "@primer/octicons-react";
import {
  FileTextIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  InfoIcon,
  LinkIcon,
  MessageSquareIcon,
  PaperclipIcon,
  RefreshCwIcon,
} from "lucide-react";
import { JiraIcon } from "~/t3work/components/brand/t3work-AtlassianLogos";

export type KindConfig = {
  Icon: React.ComponentType<{ className?: string; label?: string }>;
  iconClassName: string;
  chipClassName: string;
  badgeClassName: string;
  label: string;
};

export const KIND_CONFIGS: Record<string, KindConfig> = {
  "jira-work-item": {
    Icon: JiraIcon as React.ComponentType<{ className?: string; label?: string }>,
    iconClassName: "text-[#1868db]",
    chipClassName: "border-[#1868db]/20 bg-[#1868db]/5 hover:border-[#1868db]/30",
    badgeClassName: "bg-[#1868db]/10 text-[#1868db]",
    label: "Jira",
  },
  "jira-ticket-metadata": {
    Icon: InfoIcon,
    iconClassName: "text-[#0a66c2]",
    chipClassName: "border-[#0a66c2]/20 bg-[#0a66c2]/5 hover:border-[#0a66c2]/30",
    badgeClassName: "bg-[#0a66c2]/10 text-[#0a66c2]",
    label: "Metadata",
  },
  "jira-ticket-description": {
    Icon: FileTextIcon,
    iconClassName: "text-[#1868db]",
    chipClassName: "border-[#1868db]/20 bg-[#1868db]/5 hover:border-[#1868db]/30",
    badgeClassName: "bg-[#1868db]/10 text-[#1868db]",
    label: "Description",
  },
  "jira-ticket-attachments": {
    Icon: PaperclipIcon,
    iconClassName: "text-[#0055cc]",
    chipClassName: "border-[#0055cc]/20 bg-[#0055cc]/5 hover:border-[#0055cc]/30",
    badgeClassName: "bg-[#0055cc]/10 text-[#0055cc]",
    label: "Attachments",
  },
  "jira-ticket-comments": {
    Icon: MessageSquareIcon,
    iconClassName: "text-[#1f845a]",
    chipClassName: "border-[#1f845a]/20 bg-[#1f845a]/5 hover:border-[#1f845a]/30",
    badgeClassName: "bg-[#1f845a]/10 text-[#1f845a]",
    label: "Comments",
  },
  "jira-ticket-relationships": {
    Icon: GitBranchIcon,
    iconClassName: "text-[#7f5fff]",
    chipClassName: "border-[#7f5fff]/20 bg-[#7f5fff]/5 hover:border-[#7f5fff]/30",
    badgeClassName: "bg-[#7f5fff]/10 text-[#7f5fff]",
    label: "Links",
  },
  "jira-ticket-parent": {
    Icon: GitBranchIcon,
    iconClassName: "text-[#44546f]",
    chipClassName: "border-[#44546f]/20 bg-[#44546f]/5 hover:border-[#44546f]/30",
    badgeClassName: "bg-[#44546f]/10 text-[#44546f]",
    label: "Parent",
  },
  "github-activity": {
    Icon: MarkGithubIcon as React.ComponentType<{ className?: string; label?: string }>,
    iconClassName: "text-foreground/80",
    chipClassName: "border-border/70 bg-muted/40 hover:border-border",
    badgeClassName: "bg-muted text-muted-foreground",
    label: "GitHub",
  },
  "github-activity-pr": {
    Icon: GitPullRequestIcon,
    iconClassName: "text-sky-600",
    chipClassName: "border-sky-500/20 bg-sky-500/5 hover:border-sky-500/35",
    badgeClassName: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    label: "Pull request",
  },
  "github-activity-pr-open": {
    Icon: GitPullRequestIcon,
    iconClassName: "text-emerald-600",
    chipClassName: "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/35",
    badgeClassName: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    label: "Open PR",
  },
  "github-activity-pr-closed": {
    Icon: GitPullRequestIcon,
    iconClassName: "text-rose-600",
    chipClassName: "border-rose-500/20 bg-rose-500/5 hover:border-rose-500/35",
    badgeClassName: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    label: "Closed PR",
  },
  "github-activity-pr-merged": {
    Icon: GitBranchIcon,
    iconClassName: "text-violet-600",
    chipClassName: "border-violet-500/20 bg-violet-500/5 hover:border-violet-500/35",
    badgeClassName: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    label: "Merged PR",
  },
  "github-activity-pr-draft": {
    Icon: GitPullRequestIcon,
    iconClassName: "text-amber-600",
    chipClassName: "border-amber-500/20 bg-amber-500/5 hover:border-amber-500/35",
    badgeClassName: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    label: "Draft PR",
  },
  "github-activity-review-requested": {
    Icon: GitPullRequestIcon,
    iconClassName: "text-blue-600",
    chipClassName: "border-blue-500/20 bg-blue-500/5 hover:border-blue-500/35",
    badgeClassName: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    label: "Review",
  },
  "github-activity-comment": {
    Icon: MessageSquareIcon,
    iconClassName: "text-orange-600",
    chipClassName: "border-orange-500/20 bg-orange-500/5 hover:border-orange-500/35",
    badgeClassName: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    label: "Comment",
  },
  "github-activity-workflow": {
    Icon: RefreshCwIcon,
    iconClassName: "text-slate-600",
    chipClassName: "border-slate-500/20 bg-slate-500/5 hover:border-slate-500/35",
    badgeClassName: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    label: "Workflow",
  },
};

export const FALLBACK_KIND_CONFIG: KindConfig = {
  Icon: LinkIcon,
  iconClassName: "text-muted-foreground",
  chipClassName: "border-border/70 bg-muted/40 hover:border-border",
  badgeClassName: "bg-muted text-muted-foreground",
  label: "Context",
};
