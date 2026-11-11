import { EnvironmentId, ProjectId, ThreadId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi, type Mock } from "vite-plus/test";

import { render } from "../../test/render";

const CLOUD = EnvironmentId.make("env-cloud");
const LOCAL = EnvironmentId.make("env-local");

interface World {
  sessions: CloudSession[];
  connected: string[];
  projects: Array<{ environmentId: string; id: string; title: string }>;
  onSessionAction: Mock;
}

const world = vi.hoisted((): World => ({
  sessions: [],
  connected: [],
  projects: [],
  onSessionAction: vi.fn(),
}));

vi.mock("~/cloud/t3team-useCloudSessionController", () => ({
  useCloudSessionController: () => ({
    available: true,
    configured: true,
    sessions: world.sessions,
    loading: false,
    onCreate: vi.fn(),
    createPending: false,
    createPendingSetup: false,
    onCloudMenuOpenChange: vi.fn(),
    onCloudMenuHint: vi.fn(),
    onSessionAction: world.onSessionAction,
    onSessionSecondaryAction: vi.fn(),
    onSessionDeleteAction: vi.fn(),
    stopDeleteEnabled: false,
    pendingSessionId: null,
    pendingKind: null,
    connectFailure: null,
    primaryEnvironmentId: LOCAL,
  }),
}));
vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({
    environments: world.connected.map((environmentId) => ({
      environmentId,
      connection: { phase: "connected" },
      entry: { target: { _tag: "BrokerConnectionTarget" } },
    })),
  }),
}));
vi.mock("~/state/entities", () => ({
  useProject: () => world.projects[0] ?? null,
  useProjects: () => world.projects,
}));
vi.mock("~/hooks/useSettings", () => ({ useClientSettings: () => ({}) }));
vi.mock("@t3tools/client-runtime/state/project-grouping", () => ({
  selectProjectGroupingSettings: () => ({}),
  deriveLogicalProjectKeyFromSettings: (project: { title: string }) => project.title,
}));
vi.mock("~/t3team/t3team-serverState", () => ({ useServerConfig: () => null }));

const { DraftId, useComposerDraftStore } = await import("~/composerDraftStore");
const { clearCloudSessionTarget, getCloudSessionTarget } =
  await import("./t3team-cloudSessionTargetStore");
const { useT3TeamRunOnCloudSessionProps } =
  await import("~/components/cloud/t3team-useRunOnCloudSessionProps");

const DRAFT = "draft-rebind";
const ready = (sessionId: string, environmentId: string): CloudSession =>
  ({ sessionId, phase: "ready", environmentId, name: sessionId }) as unknown as CloudSession;

/** Clicking this stands in for the "Run on" row; the hook's handler is what is under test. */
function Probe() {
  const projectRef = { environmentId: LOCAL, projectId: ProjectId.make("project-local") };
  const { selectorProps } = useT3TeamRunOnCloudSessionProps(projectRef, DRAFT, DRAFT);
  return (
    <button type="button" onClick={() => selectorProps.onSelectCloudSession?.(world.sessions[0]!)}>
      Pick
    </button>
  );
}

function setup(next: Partial<Omit<World, "onSessionAction">>) {
  world.onSessionAction.mockReset();
  world.sessions = next.sessions ?? [];
  world.connected = next.connected ?? [];
  world.projects = next.projects ?? [
    { environmentId: String(LOCAL), id: "project-local", title: "polassist" },
  ];
  clearCloudSessionTarget(DRAFT);
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  useComposerDraftStore
    .getState()
    .setProjectDraftThreadId(
      { environmentId: LOCAL, projectId: ProjectId.make("project-local") },
      DraftId.make(DRAFT),
      {
        threadId: ThreadId.make("thread-1"),
      },
    );
}

const draftEnvironment = () =>
  useComposerDraftStore.getState().draftThreadsByThreadKey[DRAFT]?.environmentId;

describe("picking a ready session under Run on", () => {
  it("reconnects the machine whose previous session ended on the same environment id", async () => {
    setup({ sessions: [ready("session-new", String(CLOUD))], connected: [] });
    await using screen = await render(<Probe />, { router: false });
    await screen.getByRole("button", { name: "Pick" }).click();
    expect(world.onSessionAction).toHaveBeenCalledWith(world.sessions[0]);
    expect(getCloudSessionTarget(DRAFT)).toMatchObject({ sessionId: "session-new" });
  });

  it("moves the unsent draft onto that machine's copy of the project", async () => {
    setup({
      sessions: [ready("session-new", String(CLOUD))],
      connected: [String(CLOUD)],
      projects: [
        { environmentId: String(LOCAL), id: "project-local", title: "polassist" },
        { environmentId: String(CLOUD), id: "project-cloud", title: "polassist" },
      ],
    });
    await using screen = await render(<Probe />, { router: false });
    expect(draftEnvironment()).toBe(LOCAL);
    await screen.getByRole("button", { name: "Pick" }).click();
    expect(draftEnvironment()).toBe(CLOUD);
    // Already connected: nothing to re-register, so no connect is asked for.
    expect(world.onSessionAction).not.toHaveBeenCalled();
  });

  it("leaves the draft where it is when the machine has no copy of the project", async () => {
    setup({ sessions: [ready("session-new", String(CLOUD))], connected: [] });
    await using screen = await render(<Probe />, { router: false });
    await screen.getByRole("button", { name: "Pick" }).click();
    expect(draftEnvironment()).toBe(LOCAL);
  });
});
