import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { EnvironmentLiveState } from "~/cloud/t3team-environmentLiveState";
import { TimelineRowCtx, type TimelineRowSharedState } from "~/components/chat/timelineRowContext";

import { render } from "../../../test/render";

let liveState: EnvironmentLiveState = "live";

vi.mock("~/cloud/t3team-useEnvironmentLiveState", () => ({
  useEnvironmentLiveState: () => liveState,
}));
vi.mock("~/components/chat/TimelineWorkGroupRows", () => ({
  WorkingTimelineRow: () => <div data-testid="real-working-row">Working for 15s</div>,
}));

const { T3TeamWorkingTimelineRow } = await import("./t3team-WorkingTimelineRowGate");

const context: TimelineRowSharedState = {
  citationRequest: null,
  listRef: { current: null },
  timestampFormat: "locale",
  routeThreadKey: "thread",
  threadRef: null,
  markdownCwd: undefined,
  resolvedTheme: "light",
  workspaceRoot: undefined,
  skills: [],
  runs: [],
  activeThreadEnvironmentId: EnvironmentId.make("cloud"),
  onRevertToTurnCount: vi.fn(),
  onUseArtifactTemplate: vi.fn(),
  onSendAppMessage: undefined,
  onAppFullscreenChange: vi.fn(),
  onRunShellCommand: undefined,
  findActive: false,
  onImageExpand: vi.fn(),
  onOpenTurnDiff: vi.fn(),
  onOpenThread: vi.fn(),
  workflowOpening: null,
  onForkFromRun: async () => {},
  onRollbackCheckpoint: vi.fn(),
  onToggleTurnFold: vi.fn(),
  onToggleAttemptFold: vi.fn(),
  onFileOpen: vi.fn(),
  onFileDownload: vi.fn(),
  openPullRequest: vi.fn(),
  onToggleWorkGroup: vi.fn(),
  onToggleWorkEntry: vi.fn(),
  onCancelWorktreeSetup: null,
  retryableWorkspacePreparationRunIds: new Set(),
  onRetryWorkspacePreparation: null,
  onWorktreeSetupWorkLocally: null,
  onOpenWorktreeSetupTerminal: null,
  workGroupViewState: { scrollPositions: new Map(), expandedEntries: new Set() },
  threadJobsController: undefined,
  backgroundJobStarters: new Map(),
};
const ui = () => (
  <TimelineRowCtx value={context}>
    <T3TeamWorkingTimelineRow row={{ kind: "working", id: "working", createdAt: null }} />
  </TimelineRowCtx>
);

describe("T3TeamWorkingTimelineRow", () => {
  it("keeps the real working row while the environment is live", async () => {
    liveState = "live";
    await using screen = await render(ui(), { router: false });
    expect(screen.container.textContent).toBe("Working for 15s");
  });

  it("replaces a counting working row with a frozen offline row", async () => {
    liveState = "offline";
    await using screen = await render(ui(), { router: false });
    expect(screen.container.querySelector("[data-testid=real-working-row]")).toBeNull();
    expect(screen.container.textContent).toBe("Offline — last seen working");
  });

  it("says the cloud session ended when it did", async () => {
    liveState = "ended";
    await using screen = await render(ui(), { router: false });
    expect(screen.container.textContent).toBe("Cloud session ended");
  });

  it("resumes the real row when the connection returns", async () => {
    liveState = "offline";
    await using screen = await render(ui(), { router: false });
    liveState = "live";
    await screen.rerender(ui());
    expect(screen.container.textContent).toBe("Working for 15s");
  });
});
