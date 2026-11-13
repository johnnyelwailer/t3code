/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot. */
import { act, memo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vite-plus/test";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";

import { T3TeamProjectMachineSourceSection } from "./t3team-ProjectMachineSourceSection";
import { renderCounter } from "~/test/t3team-renderCounter";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const machineAtom = { tag: "machine" as const };
const permAtom = { tag: "perm" as const };

vi.mock("~/state/t3team-cloudSessions", () => ({
  cloudSessionEnvironment: {
    projectMachine: () => machineAtom,
    setProjectMachineSource: { permissionAtom: () => permAtom },
  },
}));

vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: { tag?: string }) =>
    atom?.tag === "machine" ? AsyncResult.success(Option.none()) : true,
}));

vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: () => async () => ({ _tag: "Success" as const, value: undefined }),
}));

vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("../ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("./settingsLayout", () => ({
  SettingsSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  SettingsRow: ({
    title,
    description,
    control,
  }: {
    title: string;
    description: React.ReactNode;
    control: React.ReactNode;
  }) => (
    <div>
      <h3>{title}</h3>
      <div>{description}</div>
      <div>{control}</div>
    </div>
  ),
  SettingResetButton: () => null,
}));

const envA = "env-a" as EnvironmentId;
const envB = "env-b" as EnvironmentId;
const projectA = "proj-a" as ProjectId;
const projectB = "proj-b" as ProjectId;

const counter = renderCounter();

const CountingSection = memo(function CountingSection(props: {
  rowId: string;
  environmentId: EnvironmentId;
  projectId: ProjectId;
}) {
  counter.count(props.rowId);
  return (
    <T3TeamProjectMachineSourceSection
      environmentId={props.environmentId}
      projectId={props.projectId}
    />
  );
});

function Interactive() {
  const [tick, setTick] = useState(0);
  return (
    <div>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        tick {tick}
      </button>
      <CountingSection rowId="section-a" environmentId={envA} projectId={projectA} />
      <CountingSection rowId="section-b" environmentId={envB} projectId={projectB} />
    </div>
  );
}

describe("T3TeamProjectMachineSourceSection re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    counter.reset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("mounts each section once and does not re-render when an unrelated parent tick changes", async () => {
    await act(async () => {
      root.render(<Interactive />);
    });
    counter.expectRerendered({ "section-a": 1, "section-b": 1 });
    counter.reset();
    await act(async () => {
      container.querySelector("button")?.click();
    });
    counter.expectRerendered({});
  });
});
