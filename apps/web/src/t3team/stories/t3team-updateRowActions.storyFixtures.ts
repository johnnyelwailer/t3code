import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";

import type { ProviderUpdateCandidate } from "~/components/ProviderUpdateLaunchNotification.logic";
import type { ServerUpdateTarget } from "~/components/ServerUpdateAction";
import type { UpdateEverythingRow } from "~/components/sidebar/updateEverything.logic";

const MACBOOK = EnvironmentId.make("env-macbook-joerg");
const BUILD_RUNNER = EnvironmentId.make("env-build-runner-zurich");
const TOKYO = EnvironmentId.make("env-tokyo-office");

export const STORY_VERSION = "0.1.2-rc.25";

export const STORY_ROWS: ReadonlyArray<UpdateEverythingRow> = [
  {
    environmentId: MACBOOK,
    label: "MacBook Pro von Jörg Müller-Lüdenscheidt",
    app: "this-app",
    providers: ["Claude", "Codex", "Cursor", "OpenCode"],
    skipped: null,
  },
  {
    environmentId: BUILD_RUNNER,
    label: "build-runner-zürich-02.nexplore.internal",
    app: "server",
    providers: ["Claude", "Grok", "Antigravity"],
    skipped: null,
  },
  {
    environmentId: TOKYO,
    label: "東京オフィスのデスクトップ",
    app: "desktop-app",
    providers: ["Codex"],
    skipped: null,
  },
];

export const STORY_SERVERS: ReadonlyArray<ServerUpdateTarget> = [
  {
    environmentId: BUILD_RUNNER,
    serverLabel: "build-runner-zürich-02.nexplore.internal",
    selfUpdate: "boot-service",
    targetVersion: STORY_VERSION,
  },
  {
    environmentId: TOKYO,
    serverLabel: "東京オフィスのデスクトップ",
    selfUpdate: "desktop-managed",
    desktopAppUpdate: true,
    targetVersion: STORY_VERSION,
  },
];

function candidate(driver: string, current: string, latest: string): ProviderUpdateCandidate {
  const provider: ServerProvider = {
    instanceId: ProviderInstanceId.make(driver),
    driver: ProviderDriverKind.make(driver),
    enabled: true,
    installed: true,
    version: current,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-11-14T08:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
  return {
    ...provider,
    versionAdvisory: {
      status: "behind_latest",
      currentVersion: current,
      latestVersion: latest,
      updateCommand: `update ${driver}`,
      canUpdate: true,
      checkedAt: "2026-11-14T08:00:00.000Z",
      message: "Update available.",
    },
  };
}

export const STORY_PROVIDER_MACHINES = [
  {
    environmentId: MACBOOK,
    label: STORY_ROWS[0]!.label,
    candidates: [
      candidate("claudeAgent", "2.1.3", "2.2.0"),
      candidate("codex", "0.61.0", "0.63.1"),
      candidate("cursor", "1.7.2", "1.8.0"),
      candidate("opencode", "0.14.0", "0.15.2"),
    ],
  },
  {
    environmentId: BUILD_RUNNER,
    label: STORY_ROWS[1]!.label,
    candidates: [
      candidate("claudeAgent", "2.1.3", "2.2.0"),
      candidate("grok", "0.9.0", "0.9.4"),
      candidate("antigravity", "1.0.1", "1.1.0"),
    ],
  },
  {
    environmentId: TOKYO,
    label: STORY_ROWS[2]!.label,
    candidates: [candidate("codex", "0.61.0", "0.63.1")],
  },
];
