import type { FeatureFlagDefinition } from "./t3team-featureFlagTypes.ts";

/** Flags that existed before the registry carried metadata, plus the switches that used to be
 * read straight from env. Their code defaults are unchanged; release presets decide the rest. */
export const CORE_FEATURE_FLAG_DEFINITIONS = {
  NEXI_MOBILE_BROKER: {
    group: "Cloud & machines",
    label: "Nexi Work mobile broker",
    description:
      "Allow Nexi Work Android clients to sign in with Entra and attach enrolled desktop hosts. Enable from an existing paired environment, or ship it on in a distribution mobile profile (extra.nexi.featureFlags).",
    defaultEnabled: false,
    requiresRestart: false,
  },
  MAIN_REPOSITORY: {
    group: "Orchestration",
    subgroup: "Projects",
    label: "Project main repository",
    description:
      "Pick and switch a project's main repository; delegated worktrees default to it. Off: no switching and no default repository.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  NEXI_STATE_DIR: {
    group: "Platform",
    label: "Project state in .nexi",
    description:
      "Store project state in .nexi instead of .t3team. Decided by the release so two installs never split project state.",
    defaultEnabled: true,
    requiresRestart: true,
    userToggleable: false,
  },
  MACHINE_SETUP: {
    group: "Cloud & machines",
    subgroup: "Project machines",
    label: "Machine setup",
    description:
      "Set up a project machine from the first message of a cloud session for a project that has none.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  // Temporarily disabled 2026-10-07: only the developer profile is tailored, so the chooser
  // costs a setup step without changing the UX. Relanding: nexplore.ghe.com/hive/nx-nexi/issues/60.
  WORK_PROFILE_CHOOSER: {
    group: "UI & rendering",
    subgroup: "Onboarding",
    label: "Work profile chooser",
    description:
      "Show the work profile chooser in first-run setup, the add-project wizard and Settings. Off: everyone uses the developer profile.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  MYWORK_RIGHT_PANEL: {
    group: "My Work",
    label: "Right panel tabs",
    description:
      "My Work aside uses PR, thread and browser tabs with an agent kickoff when empty. Off: the earlier PR aside.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  TRANSIENT_AUTO_RESUME: {
    group: "Agent",
    subgroup: "Reliability",
    label: "Transient auto-resume",
    description:
      "A run that failed on a transient gateway error keeps retrying on a durable backoff, with a composer banner. Off: the run stays failed after the retry budget.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  GHE_REPOSITORY_CATALOG: {
    group: "Orchestration",
    subgroup: "Projects",
    label: "GitHub Enterprise repository catalog",
    description:
      "The repository picker lists every repository the account can reach on a GitHub Enterprise host, like github.com. Off: GHE hosts only search names matching the project title.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  RESOURCE_PRESSURE: {
    group: "Ops",
    label: "Resource pressure",
    description:
      "Memory-pressure sampling, auto-pause at turn boundaries, per-thread cleanup and the Diagnostics panel.",
    defaultEnabled: false,
    requiresRestart: true,
  },
  KANBAN_SEMANTIC_ZOOM: {
    group: "My Work",
    subgroup: "Kanban",
    label: "Kanban semantic zoom",
    description: "Three card-density levels on the kanban board, steered by toolbar or pinch.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  THREAD_RESUB_STAGGER: {
    group: "Platform",
    label: "Staggered thread resubscribe",
    description:
      "Spread thread resubscribes after a reconnect instead of reopening every stream at once. Off brings back the disconnect storm.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  CLOUD_BROKER: {
    group: "Cloud & machines",
    subgroup: "Cloud sessions",
    label: "Nexi broker",
    description:
      "Route new cloud sessions through the Nexi broker when the build configures one. Off: T3 Connect.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  SESSION_CRED_ISSUE: {
    group: "Cloud & machines",
    subgroup: "Cloud sessions",
    label: "Session credential handoff",
    description: "Issue a scoped credential to a new cloud session so it can reach this host.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  BACKEND_WATCHDOG: {
    group: "Platform",
    label: "Backend health watchdog",
    description:
      "The desktop app restarts a backend that stops answering health probes for about 30 seconds.",
    defaultEnabled: true,
    requiresRestart: true,
    envAliases: ["T3TEAM_BACKEND_WATCHDOG"],
    // Read by the desktop shell before the backend (and its database) exists.
    userToggleable: false,
  },
  SETTINGS_FEATURES_PAGE: {
    group: "UI & rendering",
    label: "Settings → Features",
    description: "This page: every feature switch with its source and a per-user override.",
    defaultEnabled: true,
    requiresRestart: false,
  },
} as const satisfies Record<string, FeatureFlagDefinition>;
