// @vitest-environment jsdom
/**
 * GHE #208/#40 — regression: a running thread's live status summary must show
 * the deterministic 4-state word (`activityState`), with the LLM `activityLabel`
 * appended only while `t3teamActivityLabelsEnabled` is on — and must NEVER fall
 * back to the plain "Working" label while the shell carries a state word.
 *
 * The chain under test is the real client path the sidebar rows render from:
 *
 *   `thread-upserted` shell stream event (activityState + activityLabel) →
 *   `applyShellStreamEvent` (the same reducer the WS shell subscription drives)
 *   → `useMergedThreads` / `mergeEnvironmentThread` (over a STALE cached detail
 *     that carries no activityState — the pre-fix failure mode: the cached
 *     detail shadowed the live shell's activity fields) →
 *   `syncLiveThreadMetadataToLocalState` / `mapLiveThreadToProjectThread`
 *   → the row's live summary: the sub-run row (`SidebarSubRunRow`) and the
 *     parent card's verbatim `resolveActivityPillDisplay` derivation.
 */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Atom } from "effect/unstable/reactivity";
import type {
  OrchestrationShellSnapshot,
  OrchestrationShellStreamEvent,
  OrchestrationThreadShell,
} from "@t3tools/contracts";
import { applyShellStreamEvent } from "@t3tools/client-runtime/state/shell";

const settingsState = vi.hoisted(() => ({
  activityLabelsEnabled: true,
}));

vi.mock("~/hooks/useSettings", () => ({
  usePrimarySettings: (selector?: (settings: Record<string, unknown>) => unknown) =>
    selector ? selector({ t3teamActivityLabelsEnabled: settingsState.activityLabelsEnabled }) : {},
}));

const entitiesHarness = vi.hoisted(() => ({
  refs: [] as Array<{ environmentId: string; threadId: string }>,
  shells: [] as unknown[],
}));

vi.mock("~/state/entities", () => ({
  useThreadRefs: () => entitiesHarness.refs,
  useThreadShells: () => entitiesHarness.shells,
}));

// Detail atoms: one thread carries a STALE cached detail (opened before the
// state word arrived — no activityState/activityLabel on it), the other was
// never opened (null detail). Both must resolve their live summary from the
// shell, exactly as `useMergedThreads` reads them via the app atom registry.
const staleDetail = {
  id: "thread-stale",
  projectId: "project-test",
  environmentId: "env-test",
  title: "Stale detail thread",
  modelSelection: { instanceId: "codex", model: "gpt-5.4" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
  deletedAt: null,
  settledOverride: null,
  settledAt: null,
  messages: [],
  proposedPlans: [],
  activities: [],
  checkpoints: [],
  session: null,
} as never;

vi.mock("~/state/threads", () => ({
  environmentThreadShells: {
    threadShellAtom: () => null,
  },
  environmentThreadDetails: {
    detailAtom: (ref: { threadId: string }) =>
      Atom.make(() => (ref.threadId === "thread-stale" ? staleDetail : null)),
  },
}));

import { resetAppAtomRegistryForTests } from "~/rpc/atomRegistry";
import type { ProjectThread } from "~/t3team/t3team-types";
import { syncLiveThreadMetadataToLocalState } from "~/t3team/hooks/t3team-threadBridge";
import { useMergedThreads } from "~/t3team/t3team-mergedThreads";
import { resolveActivityPillDisplay } from "~/t3team/t3team-activityStateDisplay";
import { SidebarSubRunRow } from "../components/t3team-SidebarSubRunRow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const childRef = { environmentId: "env-test", threadId: "thread-stale" } as never;

function baseShell(overrides: Record<string, unknown> = {}): OrchestrationThreadShell {
  return {
    id: "thread-stale",
    projectId: "project-test",
    environmentId: "env-test",
    title: "Stale detail thread",
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    session: null,
    latestUserMessageAt: null,
    ...overrides,
  } as unknown as OrchestrationThreadShell;
}

function upsert(sequence: number, thread: OrchestrationThreadShell): OrchestrationShellStreamEvent {
  return { kind: "thread-upserted", sequence, thread } as OrchestrationShellStreamEvent;
}

const runningSession = {
  status: "running",
  providerName: "codex",
  providerInstanceId: null,
  providerSessionId: null,
  providerThreadId: null,
  runtimeMode: "full-access",
  activeTurnId: null,
  lastError: null,
  updatedAt: "2026-01-01T00:01:00.000Z",
} as never;

interface Probe {
  readonly projectThreads: () => ProjectThread[];
  readonly push: (event: OrchestrationShellStreamEvent) => void;
  readonly unmount: () => void;
}

function mountProbe(initial: OrchestrationShellSnapshot): Probe {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latest: ProjectThread[] = [];
  let pushEvent: (event: OrchestrationShellStreamEvent) => void = () => {};

  function ProbeComponent() {
    const [snapshot, setSnapshot] = useState(initial);
    pushEvent = (event) => {
      // The same application the live WS shell subscription performs:
      // sequence-gated, in-place snapshot update.
      setSnapshot((current) =>
        event.sequence > current.snapshotSequence ? applyShellStreamEvent(current, event) : current,
      );
    };
    entitiesHarness.shells = snapshot.threads as never[];
    entitiesHarness.refs = snapshot.threads.map((thread) => ({
      environmentId: "env-test",
      threadId: thread.id,
    }));
    const merged = useMergedThreads();
    // The project-store sync step: live shells → local ProjectThreads.
    latest = syncLiveThreadMetadataToLocalState({
      threads: [],
      storedProjects: [],
      liveProjects: [],
      liveThreads: merged,
    });
    return null;
  }

  act(() => {
    root.render(<ProbeComponent />);
  });

  return {
    projectThreads: () => latest,
    push: (event) => act(() => pushEvent(event)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function renderRow(thread: ProjectThread, ref: unknown): string {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ul>
        <SidebarSubRunRow
          child={thread}
          childRef={ref as never}
          isActive={false}
          onNavigate={() => {}}
          onContextMenu={() => {}}
        />
      </ul>,
    );
  });
  const text = container.querySelector("button")?.textContent ?? "";
  act(() => root.unmount());
  container.remove();
  return text;
}

/** The parent card's verbatim derivation (Sidebar.tsx): base label "Working",
 *  the state word when present, the LLM detail only while the flag is on. */
function parentCardSummary(thread: ProjectThread): string {
  return resolveActivityPillDisplay({
    label: "Working",
    ...(thread.activityState && thread.activityState !== null
      ? { activityState: thread.activityState }
      : {}),
    ...(settingsState.activityLabelsEnabled && thread.activityLabel
      ? { activityLabel: thread.activityLabel }
      : {}),
  });
}

beforeEach(() => {
  settingsState.activityLabelsEnabled = true;
  resetAppAtomRegistryForTests();
});

afterEach(() => {
  entitiesHarness.refs = [];
  entitiesHarness.shells = [];
});

const initialSnapshot: OrchestrationShellSnapshot = {
  projects: [],
  threads: [baseShell({ session: runningSession })],
  snapshotSequence: 0,
} as unknown as OrchestrationShellSnapshot;

describe("live status summary reaches the rows (GHE #208/#40)", () => {
  it("a thread with activityState='thinking' renders the LLM label, not 'Working' (stale detail cached)", () => {
    const probe = mountProbe(initialSnapshot);
    // The classifier persisted a state transition + the LLM enrichment landed:
    // the live shell now carries both. The cached detail has neither.
    probe.push(
      upsert(
        1,
        baseShell({
          session: runningSession,
          activityState: "thinking",
          activityStateUpdatedAt: "2026-01-01T00:02:00.000Z",
          activityLabel: "Reading contracts",
          activityLabelUpdatedAt: "2026-01-01T00:02:05.000Z",
        }),
      ),
    );

    const [thread] = probe.projectThreads();
    expect(thread, "thread synced").toBeTruthy();
    expect(thread!.status).toBe("running");
    expect(thread!.activityState, "shell state word survived the merge").toBe("thinking");

    // The sub-run row's live summary — the reported surface.
    const rowText = renderRow(thread!, childRef);
    expect(rowText).toContain("Reading contracts");
    // replace, never append: no "Thinking · …" residue
    expect(rowText).not.toContain("Thinking");

    // The parent card's verbatim derivation — same answer, no disagreement.
    expect(parentCardSummary(thread!)).toBe("Reading contracts");

    probe.unmount();
  });

  it("a never-opened thread (no detail) gets the state word from the shell alone", () => {
    const probe = mountProbe({
      projects: [],
      threads: [
        baseShell({
          id: "thread-never-opened",
          title: "Never opened",
          session: runningSession,
        }),
      ],
      snapshotSequence: 0,
    } as unknown as OrchestrationShellSnapshot);
    probe.push(
      upsert(
        1,
        baseShell({
          id: "thread-never-opened",
          title: "Never opened",
          session: runningSession,
          activityState: "writing",
        }),
      ),
    );

    const [thread] = probe.projectThreads();
    expect(thread!.activityState).toBe("writing");
    expect(
      renderRow(thread!, { environmentId: "env-test", threadId: "thread-never-opened" }),
    ).toContain("Writing");

    probe.unmount();
  });

  it("gates the LLM detail on t3teamActivityLabelsEnabled exactly like the parent (state word stays)", () => {
    const probe = mountProbe(initialSnapshot);
    probe.push(
      upsert(
        1,
        baseShell({
          session: runningSession,
          activityState: "waiting",
          activityLabel: "Reading contracts",
        }),
      ),
    );
    const [thread] = probe.projectThreads();

    settingsState.activityLabelsEnabled = false;
    expect(parentCardSummary(thread!)).toBe("Waiting");
    const rowText = renderRow(thread!, childRef);
    expect(rowText).toContain("Waiting");
    expect(rowText).not.toContain("Reading contracts");

    probe.unmount();
  });

  it("keeps falling back to the stable 'Working' label when the shell carries no state word (old server)", () => {
    const probe = mountProbe(initialSnapshot);
    // No activityState on the shell — pre-#208 server interop.
    const [thread] = probe.projectThreads();
    expect(thread!.activityState).toBeUndefined();
    expect(parentCardSummary(thread!)).toBe("Working");

    probe.unmount();
  });
});
