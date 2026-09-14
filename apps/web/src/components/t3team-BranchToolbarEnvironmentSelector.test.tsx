import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  selectProps: undefined as
    | {
        readonly value?: unknown;
        readonly items?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
        readonly onOpenChange?: (open: boolean, details?: unknown) => void;
        readonly onValueChange?: (value: string) => void;
      }
    | undefined,
}));

vi.mock("lucide-react", () => ({
  CloudIcon: "svg",
  ScaleIcon: "svg",
  SettingsIcon: "svg",
}));
vi.mock("./ui/select", () => ({
  Select: (props: {
    value?: unknown;
    items?: unknown;
    onOpenChange?: unknown;
    onValueChange?: unknown;
    children?: ReactNode;
  }) => {
    testState.selectProps = props as NonNullable<typeof testState.selectProps>;
    return <div data-testid="select">{props.children}</div>;
  },
  SelectGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectGroupLabel: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  SelectItem: ({
    value,
    children,
  }: {
    value?: string;
    children?: ReactNode;
  }) => <div data-select-item={value}>{children}</div>,
  SelectPopup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectSeparator: () => <div data-testid="separator" />,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div data-testid="trigger">{children}</div>
  ),
  SelectValue: () => <span data-testid="select-value">SELECTED</span>,
}));
vi.mock("./EnvironmentMachineIcon", () => ({
  EnvironmentMachineIcon: () => <span data-testid="machine-icon" />,
}));
vi.mock("./chat/composerEventScope", () => ({ composerFloatingLayerProps: {} }));

import {
  BranchToolbarEnvironmentSelector,
  type BranchToolbarEnvironmentSelectorProps,
} from "./BranchToolbarEnvironmentSelector";

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

function renderSelector(props: Partial<BranchToolbarEnvironmentSelectorProps>): string {
  const base: BranchToolbarEnvironmentSelectorProps = {
    envLocked: false,
    environmentId: PRIMARY.environmentId,
    availableEnvironments: [PRIMARY],
    ...props,
  };
  return renderToStaticMarkup(<BranchToolbarEnvironmentSelector {...base} />);
}

function countOccurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

beforeEach(() => {
  testState.selectProps = undefined;
});

describe("BranchToolbarEnvironmentSelector", () => {
  it("stays a static label with one environment and no cloud affordance", () => {
    const markup = renderSelector({});

    expect(testState.selectProps).toBeUndefined();
    expect(markup).toContain("This device");
    expect(markup).not.toContain("New cloud session");
  });

  it("opens a menu with the cloud entry on a single primary environment", () => {
    const onCloudMenuOpenChange = vi.fn();
    const onCreateCloudSession = vi.fn();
    const markup = renderSelector({
      onCreateCloudSession,
      onCloudMenuOpenChange,
    });

    // No picker: the machine row is informational, the only choice is cloud.
    expect(testState.selectProps?.items).toEqual([
      { value: "__create-cloud-session__", label: "New cloud session" },
    ]);
    expect(markup).toContain("New cloud session");
    expect(markup).toContain("This device");
    // The machine itself is not an item: only the cloud entry is a choice.
    expect(markup).not.toContain('data-select-item="env-primary"');

    testState.selectProps?.onValueChange?.("__create-cloud-session__");
    expect(onCreateCloudSession).toHaveBeenCalledTimes(1);
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

    expect(markup).toContain("Building the workspace");
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
});
