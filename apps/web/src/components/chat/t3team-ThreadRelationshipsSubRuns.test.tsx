import { act, cloneElement, type ReactElement, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { ProjectThread } from "~/t3team/t3team-types";

const state = vi.hoisted(() => ({ projection: null as unknown }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ threadId: undefined }),
}));
vi.mock("../../state/entities", () => ({
  useThreadProjection: () => ({ projection: state.projection }),
  useThreadShells: () => [],
  useProjects: () => [],
  useServerConfigs: () => new Map(),
}));
vi.mock("../../lib/archivedThreadsState", () => ({
  useArchivedThreadSnapshots: () => ({ snapshots: [] }),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("~/hooks/useSettings", () => ({
  usePrimarySettings: (selector: (settings: Record<string, unknown>) => unknown) =>
    selector({ t3teamActivityLabelsEnabled: true }),
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render, children }: { render: ReactElement; children: ReactNode }) =>
    cloneElement(render, {}, children),
  TooltipPopup: () => null,
}));

import { useT3TeamChildThreadRelationsStore } from "~/t3team/t3team-childThreadRelationsStore";
import { ThreadRelationshipsPanel } from "./ThreadRelationshipsControl";

let renderer: ReactTestRenderer;

afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
  useT3TeamChildThreadRelationsStore.getState().setChildThreadsByParentId(new Map());
});

const at = DateTime.makeUnsafe("2026-10-04T10:00:00Z");
const subagent = (id: string, childThreadId: string, title: string) => ({
  id,
  driver: "codex",
  providerInstanceId: "codex",
  childThreadId,
  title,
  prompt: "Do it",
  model: "gpt-5.4",
  status: "running",
  progress: null,
  result: null,
  startedAt: at,
  completedAt: null,
  updatedAt: at,
});
const childThread = (id: string, title: string): ProjectThread => ({
  id,
  projectId: "project-1",
  parentThreadId: "parent",
  title,
  status: "running",
  lastMessageAt: "2026-10-04T10:00:00.000Z",
  createdAt: "2026-10-04T10:00:00.000Z",
});

it("lists an app-owned delegated child once, in the sub-run tree, and keeps provider-native rows", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.projection = {
    thread: { id: "parent", lineage: { relationshipToParent: null }, activeProviderThreadId: null },
    runs: [],
    providerThreads: [],
    providerSessions: [],
    contextTransfers: [],
    subagents: [
      subagent("agent-1", "child-delegated", "Release notes"),
      subagent("agent-2", "child-native", "Native helper"),
    ],
  };
  // The fork relation holds the delegated child (and its own child); provider-native subagents
  // never enter it.
  useT3TeamChildThreadRelationsStore.getState().setChildThreadsByParentId(
    new Map([
      ["parent", [childThread("child-delegated", "Release notes")]],
      [
        "child-delegated",
        [{ ...childThread("grandchild", "Changelog scan"), parentThreadId: "child-delegated" }],
      ],
    ]),
  );

  await act(async () => {
    renderer = create(
      <ThreadRelationshipsPanel
        environmentId={EnvironmentId.make("test")}
        threadId={ThreadId.make("parent")}
      />,
    );
  });
  const strings = renderer.root
    .findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children.filter((child) => typeof child === "string"));
  const count = (text: string) => strings.filter((value) => value.includes(text)).length;

  expect(count("Release notes")).toBe(1);
  expect(count("Native helper")).toBe(1);
  expect(count("Changelog scan")).toBe(1);
});
