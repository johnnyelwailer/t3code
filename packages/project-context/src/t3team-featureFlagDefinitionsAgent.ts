import type { FeatureFlagDefinition } from "./t3team-featureFlagTypes.ts";

/** Agent tools, orchestration, client surfaces and ops. A new flag's code default is the
 * conservative user-nightly value; dogfood builds turn the rest on through their preset. */
export const AGENT_FEATURE_FLAG_DEFINITIONS = {
  AGENTS_MAILBOX: {
    group: "Agent",
    subgroup: "Tools",
    label: "Inter-agent mailbox",
    description:
      "Threads message each other through a mailbox (burst folding, steering). Off: thread messages start a normal turn.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  AGENTS_CHANGE_REQUEST_PUBLISH: {
    group: "Agent",
    subgroup: "Tools",
    label: "Publish change requests",
    description: "Agents may commit, push and open a change request in one tool call.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  AGENTS_DESKTOP_ROUTE: {
    group: "Agent",
    subgroup: "Tools",
    label: "Desktop route request",
    description:
      "A cloud-session agent may ask you to let one host be reached through your own computer when the session's network cannot reach it. Off: the tool is not offered.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  AGENTS_PREFER_READY_PROVIDER: {
    group: "Agent",
    subgroup: "Providers",
    label: "Prefer a ready provider",
    description:
      "A new thread starts on a provider that is ready when the one it would default to cannot start (CLI missing or failing). Off: the configured default is used as is and shows its error.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  AGENTS_WIDGETS: {
    group: "Agent",
    subgroup: "Tools",
    label: "Chat widgets",
    description: "Agents can show interactive widgets in the conversation.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  AGENTS_THREAD_TOOLS: {
    group: "Agent",
    subgroup: "Tools",
    label: "Thread and usage tools",
    description:
      "Agent tools to search threads and sources, read messages, ask the user and read provider usage.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  AGENTS_TURN_WATCHDOG: {
    group: "Agent",
    subgroup: "Reliability",
    label: "Stalled-turn watchdog",
    description:
      "Interrupt a provider turn that stays silent past its budget and fail the run so it can be retried. Off: a silent turn waits until you stop it.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  ORCHESTRATION_SIGNAL_SOURCES: {
    group: "Orchestration",
    label: "Signal sources",
    description:
      "Workflows wait on durable source-control and work-item events. Off: no new signal subscriptions.",
    defaultEnabled: false,
    requiresRestart: true,
  },
  ORCHESTRATOR_LATEST_ONLY: {
    group: "Orchestration",
    label: "Current orchestrator models",
    description:
      "Hide manifest-classified legacy models from orchestrator capabilities unless includeLegacy is requested. Off: preserve pinned and search visibility.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  ORCHESTRATION_CHILD_THREADS: {
    group: "Orchestration",
    label: "Child-thread management",
    description:
      "Task operations, silence watch, settle sweeper and stop cascade for delegated threads. Off: plain delegation.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  PROJECT_LINKED_REPOSITORIES: {
    group: "Orchestration",
    subgroup: "Projects",
    label: "Linked repositories",
    description:
      "Sync and inspect a project's linked repositories, by tool and from the sync dialog.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  UI_ACTIVITY_LABELS: {
    group: "UI & rendering",
    label: "Activity labels",
    description: "A short live label on active threads saying what the agent is doing.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  UI_OUTBOX: {
    group: "UI & rendering",
    label: "Outbox",
    description: "Queue sends and workflow replies while the host is unreachable.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  UI_VOICE_INPUT: {
    group: "UI & rendering",
    label: "Voice input",
    description: "Dictate into the composer with waveform, language chips and auto-send.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  VOICE_SESSIONS: {
    group: "UI & rendering",
    subgroup: "Voice",
    label: "Voice sessions",
    description:
      "The voice thread: record from the sidebar or the floating widget and route each utterance. Off: no voice thread or widget; dictation is its own switch.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  DESKTOP_VOICE_HOTKEY: {
    group: "UI & rendering",
    subgroup: "Voice",
    label: "Global voice hotkey",
    description: "The desktop app registers a system-wide shortcut that starts a voice recording.",
    defaultEnabled: false,
    requiresRestart: true,
    // Read by the desktop shell before the backend (and its database) exists.
    userToggleable: false,
  },
  DESKTOP_DETACHED_SURFACES: {
    group: "UI & rendering",
    label: "Detached windows",
    description: "Pop a panel out into its own desktop window.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  PLATFORM_CONTEXT_REFRESH: {
    group: "Platform",
    label: "Context refresh",
    description:
      "Keep project and work-item context bundles fresh in the background. Off: context refreshes only on request.",
    defaultEnabled: true,
    requiresRestart: true,
  },
  OPS_STALL_PROFILER: {
    group: "Ops",
    label: "Stall profiler",
    description: "Profile the server when its event loop stalls, for diagnostics.",
    defaultEnabled: true,
    requiresRestart: true,
  },
} as const satisfies Record<string, FeatureFlagDefinition>;
