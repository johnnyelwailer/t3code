import type { FeatureFlagDefinition } from "./t3team-featureFlagTypes.ts";

/** Work surfaces: My Work, work items, integrations and cloud. A new flag's code default is the
 * conservative user-nightly value; dogfood builds turn the rest on through their preset. */
export const WORK_FEATURE_FLAG_DEFINITIONS = {
  MYWORK_DIGEST: {
    group: "My Work",
    label: "My Work digest",
    description:
      "The My Work landing surface: lenses, PR joins, burndown, arrangement and the digest tools for agents.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  MYWORK_KICKOFF_SEND_NOW: {
    group: "My Work",
    label: "Kickoff sends on click",
    description:
      "A plain-text My Work kickoff creates the thread and sends the first message in one request when you press Send. Off: the thread opens first and its chat sends the message when it mounts.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  MYWORK_KANBAN: {
    group: "My Work",
    subgroup: "Kanban",
    label: "Kanban board",
    description: "My Work as a kanban board with columns, matrix lanes and drag-to-change status.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  MYWORK_PR_WATCH_SURFACES: {
    group: "My Work",
    label: "PR watch status",
    description:
      "Watch status and the watched-PR indicator for your open pull requests in My Work.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  MYWORK_DIGEST_VARIANTS: {
    group: "My Work",
    label: "Digest variants",
    description:
      "Beta choices in Settings → Appearance for the digest's burndown, default lens, row navigation and agent dots. Off: the defaults, whatever was chosen.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  WORKITEM_DETAIL_DRAFTS: {
    group: "Work items",
    label: "Work item detail and drafts",
    description:
      "Work item detail, backlog table and draft review (diff, approve, create child issues) that writes back to the tracker.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  WORKITEM_PLANNING_SPACE: {
    group: "Work items",
    subgroup: "Planning space",
    label: "Planning space",
    description: "3D sprint planning inside the backlog.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  INTEGRATIONS_ATLASSIAN: {
    group: "Integrations",
    label: "Jira and Tempo",
    description:
      "Connect Jira (OAuth or API token), mirror the backlog and read Tempo capacity. Off: no Jira connection surface.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  CHANGE_REQUEST_WORKSPACE: {
    group: "Integrations",
    label: "Pull request workspace",
    description: "Pull request inbox and workspace: context, files and diff, asset download.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  INTEGRATIONS_TOOL_AUTH: {
    group: "Integrations",
    label: "CLI tool sign-in",
    description: "Install, sign in to and check command-line tools the agent uses, from one card.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  CLOUD_SESSIONS: {
    group: "Cloud & machines",
    subgroup: "Cloud sessions",
    label: "Cloud sessions",
    description:
      "Run a thread on a cloud machine: create, list, cancel and claim sessions, with queued sends.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  CLOUD_THREAD_HANDOFF: {
    group: "Cloud & machines",
    subgroup: "Handoff",
    label: "Move thread to another machine",
    description:
      "Continue a started thread on another connected machine from the thread's Move to menu. Off: threads stay where they started.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  CLOUD_PROJECT_MACHINE: {
    group: "Cloud & machines",
    subgroup: "Project machines",
    label: "Project machines",
    description:
      "Cloud sessions start from the project's committed machine definition (.nexi/machine.json). Off: a plain session machine.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  DELEGATE_CLOUD: {
    group: "Cloud & machines",
    subgroup: "Cloud sessions",
    label: "Delegate to a cloud session",
    description:
      "delegate_task accepts extensions.cloudSession: it names a fitting cloud session for the child's repository or reports that a new one is needed; nothing is started. The child still runs on this server. Off: the option is not offered.",
    defaultEnabled: false,
    requiresRestart: true,
  },
} as const satisfies Record<string, FeatureFlagDefinition>;
