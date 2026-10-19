/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS, type UnifiedSettings } from "@t3tools/contracts/settings";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { resolveComposerProviderSelection } from "~/components/ChatView.logic";
import { isProviderInstancePickerReady } from "~/providerInstances";
import {
  getT3TeamKickoffProviderBlocker,
  useT3TeamKickoffComposerState,
} from "./t3team-kickoffLaunchConfig";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const settingsRef: { current: UnifiedSettings } = { current: DEFAULT_UNIFIED_SETTINGS };

vi.mock("~/hooks/useSettings", () => ({
  usePrimarySettings: (selector?: (settings: UnifiedSettings) => unknown) =>
    selector ? selector(settingsRef.current) : settingsRef.current,
}));

const PROJECT_ID = ProjectId.make("project-ies");
const CLAUDE_ID = ProviderInstanceId.make("claudeAgent");
const CLAUDE_WORK_ID = ProviderInstanceId.make("claude_work");

function provider(input: {
  instanceId: string;
  driver: string;
  status: ServerProvider["status"];
  availability?: ServerProvider["availability"];
  models?: ReadonlyArray<string>;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: ProviderDriverKind.make(input.driver),
    enabled: true,
    installed: true,
    version: null,
    status: input.status,
    ...(input.availability ? { availability: input.availability } : {}),
    auth: { status: "authenticated" },
    checkedAt: "2026-10-19T07:00:00.000Z",
    models: (input.models ?? []).map((slug) => ({
      slug,
      name: slug,
      isCustom: false,
      capabilities: null,
    })),
    slashCommands: [],
    skills: [],
  };
}

/** The build default instance (codex / gpt-6-astra) exists but cannot start a turn. */
const CODEX_WARNING = provider({ instanceId: "codex", driver: "codex", status: "warning" });
const CODEX_UNAVAILABLE = provider({
  instanceId: "codex",
  driver: "codex",
  status: "error",
  availability: "unavailable",
});
const CLAUDE_READY = provider({
  instanceId: "claudeAgent",
  driver: "claudeAgent",
  status: "ready",
  models: ["claude-opus-5-5", "claude-sonnet-5-5"],
});
const CLAUDE_WORK_READY = provider({
  instanceId: "claude_work",
  driver: "claudeAgent",
  status: "ready",
  models: ["claude-opus-5-5"],
});

type KickoffState = ReturnType<typeof useT3TeamKickoffComposerState>;

function Probe(props: {
  providers: ReadonlyArray<ServerProvider>;
  projectId: ProjectId | null;
  onState: (state: KickoffState) => void;
}) {
  props.onState(useT3TeamKickoffComposerState(props.providers, props.projectId));
  return null;
}

describe("work-item chat composer provider selection", () => {
  let root: Root | null = null;
  let state: KickoffState | null = null;

  const mount = (providers: ReadonlyArray<ServerProvider>, projectId: ProjectId | null) => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <Probe providers={providers} projectId={projectId} onState={(next) => (state = next)} />,
      );
    });
    return () => state!;
  };

  /** What the thread composer selects for a new thread in this project on the same snapshot. */
  const threadComposerPick = (current: KickoffState) =>
    resolveComposerProviderSelection({
      entries: current.providerInstanceEntries,
      candidateInstanceIds: [
        resolveProjectSettings(settingsRef.current, PROJECT_ID).settings.defaultModelSelection
          ?.instanceId,
      ],
      lockedProvider: null,
      lockedInstanceId: null,
    }).selectedProviderEntry?.instanceId;

  const blocker = (current: KickoffState) =>
    getT3TeamKickoffProviderBlocker({
      isConnected: true,
      hasConfiguredProviders: current.hasConfiguredProviders,
      providerInstanceEntries: current.providerInstanceEntries,
      selectedProviderEntry: current.selectedProviderEntry,
    });

  beforeEach(() => {
    state = null;
    settingsRef.current = {
      ...DEFAULT_UNIFIED_SETTINGS,
      defaultModelSelection: null,
      providerInstances: {
        [CLAUDE_WORK_ID]: { driver: ProviderDriverKind.make("claudeAgent"), enabled: true },
      },
    };
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
  });

  const expectReadyClaudeSelection = (current: KickoffState) => {
    expect(current.selectedInstanceId).toBe(threadComposerPick(current));
    expect(current.selectedInstanceId).toBe(CLAUDE_ID);
    expect(current.selectedModel).toBe("claude-opus-5-5");
    expect(blocker(current)).toBeNull();
    const selectedEntry = current.selectedProviderEntry;
    expect(selectedEntry && isProviderInstancePickerReady(selectedEntry)).toBe(true);
    expect(current.modelOptionsByInstance.get(current.selectedInstanceId)?.length).toBe(2);
  };

  it("falls back to a ready instance when the build default instance is unavailable", () => {
    const read = mount([CODEX_UNAVAILABLE, CLAUDE_READY], PROJECT_ID);

    expectReadyClaudeSelection(read());
  });

  it("follows the environment default instead of the not-ready build default", () => {
    settingsRef.current = {
      ...settingsRef.current,
      defaultModelSelection: {
        instanceId: CLAUDE_ID,
        model: "claude-opus-5-5",
      },
    };
    const read = mount([CODEX_WARNING, CLAUDE_READY], PROJECT_ID);

    expectReadyClaudeSelection(read());
  });

  it("starts on the project's default model selection", () => {
    settingsRef.current = {
      ...settingsRef.current,
      projectSettingsOverrides: {
        [PROJECT_ID]: {
          defaultModelSelection: {
            instanceId: CLAUDE_WORK_ID,
            model: "claude-opus-5-5",
          },
        },
      },
    };
    const read = mount([CODEX_WARNING, CLAUDE_READY, CLAUDE_WORK_READY], PROJECT_ID);

    expect(read().selectedInstanceId).toBe(threadComposerPick(read()));
    expect(read().selectedInstanceId).toBe(CLAUDE_WORK_ID);
    expect(read().launchConfig.selection).toEqual({
      instanceId: CLAUDE_WORK_ID,
      model: "claude-opus-5-5",
    });
  });

  it("skips an instance the project disables", () => {
    settingsRef.current = {
      ...settingsRef.current,
      projectSettingsOverrides: {
        [PROJECT_ID]: { providerInstances: { [CLAUDE_ID]: { enabled: false } } },
      },
    };
    const read = mount([CLAUDE_READY, CLAUDE_WORK_READY], PROJECT_ID);

    expect(read().selectedInstanceId).toBe(CLAUDE_WORK_ID);
  });

  it("keeps an explicit pick, and says when that pick cannot start", () => {
    const read = mount([CODEX_WARNING, CLAUDE_READY], PROJECT_ID);

    act(() => read().selectModel(ProviderInstanceId.make("codex"), "gpt-6-astra"));

    expect(read().selectedInstanceId).toBe(ProviderInstanceId.make("codex"));
    expect(read().selectedModel).toBe("gpt-6-astra");
    expect(blocker(read())).toBe("Selected provider is not ready. Check provider settings.");

    act(() => read().selectModel(CLAUDE_ID, "claude-sonnet-5-5"));

    expect(read().launchConfig.selection).toEqual({
      instanceId: CLAUDE_ID,
      model: "claude-sonnet-5-5",
    });
    expect(blocker(read())).toBeNull();
  });
});
