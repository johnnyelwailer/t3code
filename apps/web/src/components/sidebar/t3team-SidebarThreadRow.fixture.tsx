import { RegistryContext } from "@effect/atom-react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { EnvironmentRegistry, PrimaryConnectionTarget } from "@t3tools/client-runtime/connection";
import { scopeThreadShell } from "@t3tools/client-runtime/state/models";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { type ComponentProps, type ReactNode, useState } from "react";

import { connectionAtomRuntime } from "~/connection/runtime";

import { TooltipProvider } from "../ui/tooltip";
import { SortableThreadRow } from "./SidebarThreadRow";

export type ThreadRowProps = ComponentProps<typeof SortableThreadRow>;
type ThreadShell = ReturnType<typeof scopeThreadShell>;

export const FIXTURE_ENVIRONMENT_ID = EnvironmentId.make("environment-primary");
const FIXTURE_PROVIDER_INSTANCE_ID = ProviderInstanceId.make("codex");
const FIXTURE_TIMESTAMP = "2026-06-20T00:00:00.000Z";

type ThreadShellOverrides = Partial<Omit<ThreadShell, "source">> & {
  readonly source?: Partial<OrchestrationV2ThreadShell>;
};

/** A quiet, idle thread as the server projects it, presented the way the client scopes shells. */
export function makeThreadShell(overrides: ThreadShellOverrides = {}): ThreadShell {
  const { source: sourceOverrides, environmentId, ...shellOverrides } = overrides;
  const id = overrides.id ?? ThreadId.make("thread-1");
  const createdAt = DateTime.makeUnsafe(FIXTURE_TIMESTAMP);
  const source: OrchestrationV2ThreadShell = {
    id,
    projectId: overrides.projectId ?? ProjectId.make("project-1"),
    title: overrides.title ?? "Prepare release checklist",
    providerInstanceId: FIXTURE_PROVIDER_INSTANCE_ID,
    modelSelection: { instanceId: FIXTURE_PROVIDER_INSTANCE_ID, model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: id, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    latestRunId: null,
    activeRunId: null,
    status: "idle",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
    ...sourceOverrides,
  };
  return {
    ...scopeThreadShell(environmentId ?? FIXTURE_ENVIRONMENT_ID, source),
    ...shellOverrides,
  };
}

const noop = () => {};

/** Complete props for `SortableThreadRow`; every callback is a no-op unless overridden. */
export function makeThreadRowProps(
  overrides: Partial<ThreadRowProps> & {
    readonly thread?: ThreadShell;
  } = {},
): ThreadRowProps {
  const thread = overrides.thread ?? makeThreadShell();
  return {
    thread,
    variant: "slim",
    variantAction: "settle",
    settlementSupported: true,
    snoozeSupported: true,
    pinningSupported: true,
    isPinned: false,
    dropVerb: null,
    dragOverPinned: false,
    sweepAction: null,
    snoozeWakeLabelText: null,
    wokeAt: null,
    isActive: false,
    isRouteThread: false,
    openPullRequestsInRightPanel: false,
    jumpLabel: null,
    currentEnvironmentId: thread.environmentId,
    environmentLabel: null,
    environmentMachine: "desktop",
    scratchMachineLabel: null,
    project: null,
    projectDisplayName: "Alpha",
    providerEntryByInstanceId: new Map(),
    timestampFormat: "locale",
    onThreadClick: noop,
    onThreadActivate: noop,
    onStartRename: noop,
    onRenameTitleChange: noop,
    onCommitRename: noop,
    onCancelRename: noop,
    isRenaming: false,
    renamingTitle: "",
    onContextMenu: noop,
    onSettle: noop,
    onActionSweepStart: noop,
    onUnsettle: noop,
    onSnooze: noop,
    onUnsnooze: noop,
    onUnpin: noop,
    onAcknowledgeWoke: noop,
    changeRequestSnapshot: null,
    onChangeRequestSnapshot: noop,
    sortableId: `${thread.environmentId}:${thread.id}`,
    sortableDisabled: true,
    contextDrag: false,
    ...overrides,
  };
}

/**
 * The catalog derives from the connection runtime's environment registry, and a value preset on a
 * derived atom is dropped as soon as that stream emits. Presetting the runtime's own layer keeps
 * the primary environment in the registry the catalog reads.
 */
function makeHarnessRegistry(primaryEnvironmentId: EnvironmentId | null) {
  if (primaryEnvironmentId === null) return AtomRegistry.make();
  const entries = new Map([
    [
      primaryEnvironmentId,
      {
        target: new PrimaryConnectionTarget({
          environmentId: primaryEnvironmentId,
          label: "This device",
          httpBaseUrl: "http://localhost:3773",
          wsBaseUrl: "ws://localhost:3773",
        }),
      },
    ],
  ]);
  const environmentRegistryLayer = Layer.effect(
    EnvironmentRegistry.EnvironmentRegistry,
    SubscriptionRef.make(entries).pipe(
      Effect.map(
        (ref) =>
          ({ entries: ref }) as unknown as EnvironmentRegistry.EnvironmentRegistry["Service"],
      ),
    ),
  );
  return AtomRegistry.make({
    initialValues: [[connectionAtomRuntime.layer, environmentRegistryLayer]],
  });
}

/**
 * Wraps a real `SortableThreadRow` in what it needs outside the app shell: dnd-kit contexts, the
 * tooltip provider and an atom registry in which `primaryEnvironmentId` is the primary environment
 * (a row only accepts agent-context drops for the primary environment's threads).
 */
export function ThreadRowHarness(props: {
  readonly row?: ThreadRowProps;
  readonly primaryEnvironmentId?: EnvironmentId | null;
  readonly children?: ReactNode;
}) {
  const row = props.row ?? makeThreadRowProps();
  const [registry] = useState(() =>
    makeHarnessRegistry(
      props.primaryEnvironmentId === undefined
        ? FIXTURE_ENVIRONMENT_ID
        : props.primaryEnvironmentId,
    ),
  );
  return (
    <RegistryContext.Provider value={registry}>
      <TooltipProvider>
        <DndContext>
          <SortableContext items={[row.sortableId]}>
            <div role="tree" aria-label="Threads" className="w-72 bg-sidebar p-2">
              <SortableThreadRow {...row} />
              {props.children}
            </div>
          </SortableContext>
        </DndContext>
      </TooltipProvider>
    </RegistryContext.Provider>
  );
}
