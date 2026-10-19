// @vitest-environment jsdom
import { type CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  selectProps: undefined as
    | {
        readonly value?: unknown;
        readonly open?: boolean;
        readonly items?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
        readonly onOpenChange?: (
          open: boolean,
          details?: { readonly reason?: string } | null,
        ) => void;
        readonly onValueChange?: (
          value: string,
          details?: {
            cancel: () => void;
            readonly isCanceled: boolean;
            readonly reason?: string;
          } | null,
        ) => void;
      }
    | undefined,
}));

vi.mock("lucide-react", () => ({
  CloudIcon: "svg",
  ScaleIcon: "svg",
  SettingsIcon: "svg",
  XIcon: "svg",
}));
vi.mock("./ui/select", () => ({
  Select: (props: {
    value?: unknown;
    open?: boolean;
    items?: unknown;
    onOpenChange?: unknown;
    onValueChange?: unknown;
    children?: ReactNode;
  }) => {
    testState.selectProps = props as NonNullable<typeof testState.selectProps>;
    return (
      <div data-testid="select" data-open={props.open ? "true" : "false"}>
        {props.children}
      </div>
    );
  },
  SelectGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectGroupLabel: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  SelectItem: ({ value, children }: { value?: string; children?: ReactNode }) => (
    <div data-select-item={value}>{children}</div>
  ),
  SelectPopup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectSeparator: () => <div data-testid="separator" />,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div data-testid="trigger">{children}</div>
  ),
  SelectValue: () => <span data-testid="select-value">SELECTED</span>,
}));
// Both triggers are Base UI `Select.Trigger`s that need the real Select root; the Select is mocked
// above, so the triggers are too. The real one is exercised in `*.panel.test.tsx`.
vi.mock("@base-ui/react/select", () => ({
  Select: { Trigger: ({ children }: { children?: ReactNode }) => <div>{children}</div> },
}));
vi.mock("./chat/ThreadDetailsControl", () => ({
  ThreadDetailsControl: ({ children }: { children?: ReactNode }) => (
    <div data-testid="trigger">{children}</div>
  ),
}));
vi.mock("./chat/ComposerControl", () => ({
  ComposerSelectControl: ({ children }: { children?: ReactNode }) => (
    <div data-testid="trigger">{children}</div>
  ),
}));
vi.mock("./EnvironmentMachineIcon", () => ({
  EnvironmentMachineIcon: () => <span data-testid="machine-icon" />,
}));
vi.mock("./chat/composerEventScope", () => ({
  composerFloatingLayerProps: {},
  useComposerMenuProps: () => ({}),
}));

import {
  BranchToolbarEnvironmentSelector,
  type BranchToolbarEnvironmentSelectorBaseProps,
  type BranchToolbarEnvironmentSelectorProps,
} from "./BranchToolbarEnvironmentSelector";
import {
  beginCloudSessionCreate,
  clearCloudSessionTarget,
  getCloudSessionTarget,
} from "~/cloud/t3team-cloudSessionTargetStore";

const PRIMARY = {
  environmentId: EnvironmentId.make("env-primary"),
  projectId: ProjectId.make("project-x"),
  label: "This device",
  isPrimary: true,
  machine: "server" as const,
};

const RELAY_A = {
  environmentId: EnvironmentId.make("env-relay-a"),
  projectId: ProjectId.make("project-x"),
  label: "nx-nexi",
  isPrimary: false,
  machine: "server" as const,
};

const RELAY_B = {
  environmentId: EnvironmentId.make("env-relay-b"),
  projectId: ProjectId.make("project-x"),
  label: "nx-nexi",
  isPrimary: false,
  machine: "server" as const,
};

const RELAY_DUPES = [PRIMARY, RELAY_A, RELAY_B];

type SelectorTestProps = Partial<BranchToolbarEnvironmentSelectorBaseProps> & {
  onHandoffToEnvironment?: (environmentId: EnvironmentId) => void;
  projectHasRemote?: boolean;
};

/** A project with a remote unless a test says otherwise. */
function withDefaults({
  onHandoffToEnvironment,
  projectHasRemote = true,
  ...props
}: SelectorTestProps): BranchToolbarEnvironmentSelectorProps {
  return {
    envLocked: false,
    environmentId: PRIMARY.environmentId,
    availableEnvironments: [PRIMARY],
    ...props,
    ...(onHandoffToEnvironment ? { onHandoffToEnvironment, projectHasRemote } : {}),
  };
}

function renderSelector(props: SelectorTestProps): string {
  return renderToStaticMarkup(<BranchToolbarEnvironmentSelector {...withDefaults(props)} />);
}

function countOccurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

function makeValueChangeDetails() {
  let canceled = false;
  return {
    cancel: () => {
      canceled = true;
    },
    get isCanceled() {
      return canceled;
    },
    reason: "item-press",
  };
}

let liveRoot: Root | null = null;
let liveContainer: HTMLElement | null = null;

function mountSelector(props: SelectorTestProps) {
  liveContainer = document.createElement("div");
  document.body.appendChild(liveContainer);
  liveRoot = createRoot(liveContainer);
  const base = withDefaults(props);
  act(() => {
    liveRoot?.render(<BranchToolbarEnvironmentSelector {...base} />);
  });
}

afterEach(() => {
  act(() => {
    liveRoot?.unmount();
  });
  liveRoot = null;
  liveContainer?.remove();
  liveContainer = null;
  vi.unstubAllGlobals();
});

beforeEach(() => {
  testState.selectProps = undefined;
  // react-dom only trusts act() when the environment opts in.
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

describe("BranchToolbarEnvironmentSelector", () => {
  it("stays a static label with one environment and no cloud affordance", () => {
    const markup = renderSelector({});

    expect(testState.selectProps).toBeUndefined();
    expect(markup).toContain("This device");
    expect(markup).not.toContain("New cloud session");
  });

  it("offers 'New cloud session' as a mouse-only row, not a keyboard item", () => {
    const onCreateCloudSession = vi.fn();
    mountSelector({ onCreateCloudSession, onCloudMenuOpenChange: () => {} });

    // The create affordance dispatches a real VM, so it is kept OUT of the
    // arrow-key focus order: no keyboard item, only a clickable row.
    expect(testState.selectProps?.items).toEqual([]);
    const createButton = findCreateButton();
    expect(createButton).not.toBeNull();

    act(() => {
      createButton?.click();
    });
    expect(onCreateCloudSession).toHaveBeenCalledTimes(1);
  });

  it("lists every cloud machine once, by name, in the one Run on list", () => {
    // Two connected machines, both registered under the generic label: neither folds into the
    // other, neither appears a second time as a session, and each shows its own name.
    const cloudEnv = (id: string) => ({
      environmentId: EnvironmentId.make(id),
      projectId: ProjectId.make("project-x"),
      label: "Cloud session",
      isPrimary: false,
      machine: "server" as const,
    });
    const session = (id: string, name?: string) =>
      ({
        sessionId: id,
        phase: "ready",
        environmentId: `env-${id}`,
        machineLabel: "ubuntu-slim",
        remainingSeconds: null,
        ...(name ? { name } : {}),
      }) as unknown as CloudSession;
    mountSelector({
      availableEnvironments: [PRIMARY, cloudEnv("env-1"), cloudEnv("env-2")],
      onEnvironmentChange: () => {},
      onCreateCloudSession: () => {},
      pendingCloudSessions: [session("1", "nexi-machine-qa"), session("2")],
    });
    const items = Array.from(liveContainer?.querySelectorAll("[data-select-item]") ?? []).map(
      (item) => item.textContent ?? "",
    );
    expect(items).toEqual([
      PRIMARY.label,
      "nexi-machine-qaReady · ubuntu-slim",
      "Cloud sessionReady · ubuntu-slim",
    ]);
    expect(testState.selectProps?.items?.map((item) => item.label)).toEqual([
      PRIMARY.label,
      "nexi-machine-qa",
      "Cloud session",
    ]);
  });

  it("clicking a ready machine selects it immediately without a connect gate", () => {
    const ready = {
      sessionId: "1",
      phase: "ready",
      environmentId: "env-cloud",
      machineLabel: "ubuntu-slim",
    } as unknown as CloudSession;
    const onSelectCloudSession = vi.fn();
    const onEnvironmentChange = vi.fn();
    mountSelector({
      onEnvironmentChange,
      onCreateCloudSession: () => {},
      onSelectCloudSession,
      pendingCloudSessions: [ready],
    });
    const readyRow = Array.from(liveContainer?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.startsWith("Cloud session"),
    );
    expect(readyRow?.disabled).not.toBe(true);
    act(() => {
      readyRow?.click();
    });
    expect(onSelectCloudSession).toHaveBeenCalledWith(ready);
    expect(onEnvironmentChange).not.toHaveBeenCalled();
    expect(liveContainer?.textContent).not.toContain("Connecting…");
  });

  it("shows the optimistic cloud selection in the trigger before the VM is connected", () => {
    renderSelector({
      onEnvironmentChange: () => {},
      onCreateCloudSession: () => {},
      selectedCloudSession: { sessionId: "1", label: "nexi-machine-qa · 7:01 PM" },
    });
    expect(testState.selectProps?.value).toBe("__cloud-session:1");
    expect(
      testState.selectProps?.items?.some((item) => item.label === "nexi-machine-qa · 7:01 PM"),
    ).toBe(true);
  });

  it("shows a create in flight at once, and a second click cannot start a second machine", () => {
    const onCreateCloudSession = vi.fn();
    mountSelector({ onCreateCloudSession, cloudSessionCreatePending: true });

    const buttons = Array.from(liveContainer?.querySelectorAll("button") ?? []);
    const pending = buttons.find((button) => button.textContent?.includes("Requesting a machine"));
    expect(pending?.disabled).toBe(true);
    act(() => {
      pending?.click();
    });
    expect(onCreateCloudSession).not.toHaveBeenCalled();
  });

  it("wires menu open/close to the polling callback", () => {
    const onCloudMenuOpenChange = vi.fn();
    renderSelector({ onCreateCloudSession: () => {}, onCloudMenuOpenChange });

    testState.selectProps?.onOpenChange?.(true);
    testState.selectProps?.onOpenChange?.(false);
    expect(onCloudMenuOpenChange).toHaveBeenNthCalledWith(1, true);
    expect(onCloudMenuOpenChange).toHaveBeenNthCalledWith(2, false);
  });

  it("offers the setup affordance instead of create when the server is unconfigured", () => {
    const onSetupCloudSessions = vi.fn();
    const markup = renderSelector({ onSetupCloudSessions });

    expect(testState.selectProps?.items).toEqual([
      { value: "__setup-cloud-sessions__", label: "Set up cloud sessions" },
    ]);
    expect(markup).toContain("Set up cloud sessions");
    expect(markup).not.toContain("New cloud session");

    testState.selectProps?.onValueChange?.("__setup-cloud-sessions__");
    expect(onSetupCloudSessions).toHaveBeenCalledTimes(1);
  });

  it("renders pending sessions read-only above the create entry", () => {
    const markup = renderSelector({
      onCreateCloudSession: () => {},
      pendingCloudSessions: [
        {
          sessionId: "session-1",
          providerKind: "github_actions",
          phase: "preparing",
          elapsedSeconds: 40,
          remainingSeconds: null,
          machineLabel: "ubuntu-slim",
          failureReason: null,
          detailsUrl: null,
        },
      ],
    });

    expect(markup).toContain("Building workspace");
    expect(markup).toContain("New cloud session");
  });

  it("lists the same machine reachable under two relay ids only once", () => {
    const onEnvironmentChange = vi.fn();
    const markup = renderSelector({
      environmentId: RELAY_A.environmentId,
      availableEnvironments: RELAY_DUPES,
      onEnvironmentChange,
    });

    // Primary + one collapsed relay row: two items, not three.
    expect(testState.selectProps?.items).toHaveLength(2);
    expect(countOccurrences(markup, "nx-nexi")).toBe(1);

    testState.selectProps?.onValueChange?.(RELAY_A.environmentId);
    expect(onEnvironmentChange).toHaveBeenCalledWith(RELAY_A.environmentId);
  });

  it("keeps the active environment when its duplicate relay row comes first", () => {
    const onEnvironmentChange = vi.fn();
    renderSelector({
      environmentId: RELAY_B.environmentId,
      availableEnvironments: RELAY_DUPES,
      onEnvironmentChange,
    });

    // The kept row is the active one, so selecting "nx-nexi" targets it.
    expect(testState.selectProps?.items).toEqual([
      { value: "env-primary", label: "This device" },
      { value: "env-relay-b", label: "nx-nexi" },
    ]);
  });

  it("closes the menu after clicking 'New cloud session' (optimistic select)", () => {
    const onCreateCloudSession = vi.fn();
    const onCloudMenuOpenChange = vi.fn();
    mountSelector({ onCreateCloudSession, onCloudMenuOpenChange });

    act(() => {
      testState.selectProps?.onOpenChange?.(true, { reason: "trigger" });
    });
    expect(testState.selectProps?.open).toBe(true);

    const createButton = findCreateButton();
    act(() => {
      createButton?.click();
    });
    expect(onCreateCloudSession).toHaveBeenCalledTimes(1);
    // Optimistic select closes the menu; list polling continues while provisioning.
    expect(testState.selectProps?.open).toBe(false);
    expect(onCloudMenuOpenChange).toHaveBeenCalledWith(false);
  });

  it("still closes the menu when a normal environment row is selected", () => {
    const onEnvironmentChange = vi.fn();
    const onCloudMenuOpenChange = vi.fn();
    mountSelector({ onEnvironmentChange, onCloudMenuOpenChange });

    act(() => {
      testState.selectProps?.onOpenChange?.(true, { reason: "trigger" });
    });

    const details = makeValueChangeDetails();
    act(() => {
      testState.selectProps?.onValueChange?.("env-relay-a", details);
    });
    expect(onEnvironmentChange).toHaveBeenCalledWith(EnvironmentId.make("env-relay-a"));
    expect(details.isCanceled).toBe(false);

    act(() => {
      testState.selectProps?.onOpenChange?.(false, { reason: "item-press" });
    });
    expect(testState.selectProps?.open).toBe(false);
    expect(onCloudMenuOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("shows the most recent failed session read-only with its reason", () => {
    mountSelector({
      onCreateCloudSession: () => {},
      pendingCloudSessions: [
        {
          sessionId: "session-1",
          providerKind: "github_actions",
          phase: "preparing",
          elapsedSeconds: 40,
          remainingSeconds: null,
          machineLabel: "ubuntu-slim",
          failureReason: null,
          detailsUrl: null,
        },
        {
          sessionId: "session-0",
          providerKind: "github_actions",
          phase: "failed",
          elapsedSeconds: 12,
          remainingSeconds: null,
          machineLabel: "ubuntu-slim",
          failureReason: "No matching runner was available.",
          detailsUrl: null,
        },
      ],
    });

    expect(markupContainsFailedRow()).toBe(true);
  });

  it("does not pulse the icon of a failed row", () => {
    mountSelector({
      onCreateCloudSession: () => {},
      pendingCloudSessions: [
        {
          sessionId: "session-0",
          providerKind: "github_actions",
          phase: "failed",
          elapsedSeconds: 12,
          remainingSeconds: null,
          machineLabel: "ubuntu-slim",
          failureReason: "No matching runner was available.",
          detailsUrl: null,
        },
      ],
    });

    expect(liveContainer?.querySelector(".animate-pulse")).toBeNull();
    expect(liveContainer?.textContent).toContain("Failed");
  });
});

function markupContainsFailedRow(): boolean {
  const node = liveContainer;
  return node !== null && node.textContent?.includes("No matching runner was available.") === true;
}

function findCreateButton(): HTMLButtonElement | null {
  const buttons = Array.from(liveContainer?.querySelectorAll("button") ?? []);
  return (
    buttons.find((button) => button.textContent?.includes("New cloud session") === true) ?? null
  );
}

describe("BranchToolbarEnvironmentSelector — Move to (started thread, panel)", () => {
  const CLOUD_ENV = {
    environmentId: EnvironmentId.make("env-cloud"),
    projectId: ProjectId.make("project-x"),
    label: "Cloud session",
    isPrimary: false,
    machine: "server" as const,
  };
  const session = (phase: string, environmentId?: string) =>
    ({
      sessionId: `s-${phase}`,
      phase,
      ...(environmentId ? { environmentId } : {}),
      machineLabel: "ubuntu-slim",
    }) as unknown as CloudSession;
  const mountMove = (props: SelectorTestProps = {}) => {
    const handlers = {
      onEnvironmentChange: vi.fn(),
      onHandoffToEnvironment: vi.fn(),
      onConnectCloudSession: vi.fn(),
      onSelectCloudSession: vi.fn(),
    };
    mountSelector({
      envLocked: true,
      displayMode: "panel",
      availableEnvironments: [PRIMARY, CLOUD_ENV],
      onCreateCloudSession: () => {},
      pendingCloudSessions: [session("ready", "env-cloud"), session("preparing")],
      ...handlers,
      ...props,
    });
    return handlers;
  };

  it("stays the locked label for a started thread without a handoff handler", () => {
    const markup = renderSelector({
      envLocked: true,
      displayMode: "panel",
      availableEnvironments: [PRIMARY, CLOUD_ENV],
      onEnvironmentChange: () => {},
      onCreateCloudSession: () => {},
    });
    expect(testState.selectProps).toBeUndefined();
    expect(markup).not.toContain("Move to");
  });

  it("stays locked in the composer strip even with a handoff handler", () => {
    renderSelector({
      envLocked: true,
      displayMode: "toolbar",
      onHandoffToEnvironment: () => {},
      onCreateCloudSession: () => {},
    });
    expect(testState.selectProps).toBeUndefined();
  });

  it("opens an interactive 'Move to' menu with machines, cloud sessions and create", () => {
    mountMove();
    expect(liveContainer?.textContent).toContain("Move to");
    expect(liveContainer?.textContent).not.toContain("Run on");
    const items = Array.from(liveContainer?.querySelectorAll("[data-select-item]") ?? []).map(
      (item) => item.getAttribute("data-select-item"),
    );
    expect(items).toEqual(["env-primary", "env-cloud"]);
    expect(findCreateButton()).not.toBeNull();
    expect(testState.selectProps?.value).toBe("env-primary");
  });

  it("routes a pick to onHandoffToEnvironment, never onEnvironmentChange", () => {
    const handlers = mountMove();
    act(() => {
      testState.selectProps?.onValueChange?.("env-cloud", makeValueChangeDetails());
    });
    expect(handlers.onHandoffToEnvironment).toHaveBeenCalledWith(CLOUD_ENV.environmentId);
    expect(handlers.onEnvironmentChange).not.toHaveBeenCalled();
  });

  it("ignores re-picking the machine the thread already runs on", () => {
    const handlers = mountMove();
    act(() => {
      testState.selectProps?.onValueChange?.("env-primary", makeValueChangeDetails());
    });
    expect(handlers.onHandoffToEnvironment).not.toHaveBeenCalled();
    expect(handlers.onEnvironmentChange).not.toHaveBeenCalled();
  });

  it("connects a ready, unconnected session instead of setting a draft cloud target", () => {
    const handlers = mountMove({
      availableEnvironments: [PRIMARY],
      pendingCloudSessions: [session("ready", "env-elsewhere")],
    });
    const row = Array.from(liveContainer?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.startsWith("Cloud session"),
    );
    act(() => {
      row?.click();
    });
    expect(handlers.onConnectCloudSession).toHaveBeenCalledTimes(1);
    expect(handlers.onSelectCloudSession).not.toHaveBeenCalled();
    expect(handlers.onHandoffToEnvironment).not.toHaveBeenCalled();
  });

  // The started thread's composer reads this target on send; a Move-mode create must not set it.
  const THREAD_SCOPE = "env-primary:thread-started";
  const COMPOSER_PROJECT_KEY = "github.com/acme/app";
  const mountCreate = (props: SelectorTestProps) => {
    const create = vi.fn();
    mountMove({
      onCreateCloudSession: (options) =>
        beginCloudSessionCreate(
          { scopeKey: THREAD_SCOPE, projectKey: COMPOSER_PROJECT_KEY },
          options,
          create,
        ),
      ...props,
    });
    act(() => {
      findCreateButton()?.click();
    });
    return create;
  };

  it("creates a cloud session in Move mode without writing a Run-on target", () => {
    const create = mountCreate({});
    expect(create).toHaveBeenCalledTimes(1);
    expect(getCloudSessionTarget(THREAD_SCOPE)).toBeNull();
  });

  it("still selects the creating session as the target for a draft's Run on menu", () => {
    const create = mountCreate({ envLocked: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(getCloudSessionTarget(THREAD_SCOPE)?.sessionId).toBeDefined();
    clearCloudSessionTarget(THREAD_SCOPE);
  });

  // The project follow drops a target set up for another project, so the create must record it.
  it("tags a draft's creating target with the composer's project", () => {
    mountCreate({ envLocked: false });
    expect(getCloudSessionTarget(THREAD_SCOPE)?.projectKey).toBe(COMPOSER_PROJECT_KEY);
    clearCloudSessionTarget(THREAD_SCOPE);
  });
});
