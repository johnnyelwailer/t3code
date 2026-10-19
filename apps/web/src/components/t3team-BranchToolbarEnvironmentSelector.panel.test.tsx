// @vitest-environment jsdom

import {
  type CloudSession,
  EnvironmentId,
  ProjectId,
  T3TEAM_THREAD_HANDOFF_NO_GIT_REMOTE_MESSAGE,
  t3teamProjectHasOriginRemote,
} from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { BranchToolbarEnvironmentSelector } from "./BranchToolbarEnvironmentSelector";

// A real mouse click: Base UI opens a Select on mousedown, one animation frame later.
async function press(element: Element) {
  const init = { bubbles: true, cancelable: true, button: 0 };
  await act(async () => {
    element.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse" }));
    element.dispatchEvent(new MouseEvent("mousedown", init));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await act(async () => {
    element.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse" }));
    element.dispatchEvent(new MouseEvent("mouseup", init));
    element.dispatchEvent(new MouseEvent("click", init));
  });
}

// The panel's "Run on" row on the REAL Select (no stand-in): it must be the menu's own trigger, so
// a click opens it anchored under the row. A bare row button left it closed, or open at (0, 0).
it.each([
  ["a started thread moves", true, "Move to"],
  ["a draft re-targets", false, "Run on"],
] as const)("opens the panel Run-on row as a real dropdown where %s", async (_, started, label) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onEnvironmentChange = vi.fn();
  const onHandoffToEnvironment = vi.fn();
  const onCreateCloudSession = vi.fn();
  const measure = HTMLElement.prototype.getBoundingClientRect;
  const spies = [
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute("aria-label") === "Run on"
        ? DOMRect.fromRect({ x: 40, y: 300, width: 220, height: 28 })
        : measure.call(this);
    }),
    // jsdom has no layout: give the viewport room below the row, as the panel has.
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(800),
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1200),
  ];
  try {
    await act(async () => {
      root.render(
        <BranchToolbarEnvironmentSelector
          displayMode="panel"
          envLocked={started}
          environmentId={EnvironmentId.make("local")}
          availableEnvironments={["local", "remote"].map((id) => ({
            environmentId: EnvironmentId.make(id),
            projectId: ProjectId.make("project"),
            label: id,
            isPrimary: id === "local",
            machine: "server",
          }))}
          onCreateCloudSession={onCreateCloudSession}
          {...(started
            ? { onHandoffToEnvironment, projectHasRemote: true }
            : { onEnvironmentChange })}
        />,
      );
    });
    const row = container.querySelector('[aria-label="Run on"]')!;
    expect(row.getAttribute("aria-haspopup")).toBe("listbox");
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    await press(row);
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(listbox).not.toBeNull();
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(listbox.textContent).toContain(label);
    expect(listbox.textContent).toContain("New cloud session");
    const options = [...listbox.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((option) => option.textContent)).toEqual(["local", "remote"]);
    const positioner = listbox.closest<HTMLElement>('[data-slot="select-positioner"]')!;
    // Under the row (y 300 + height 28 + 4px offset) and as wide as it, not at (0, 0).
    expect(positioner.getAttribute("data-side")).toBe("bottom");
    expect(positioner.style.transform).toBe("translate(40px, 332px)");
    expect(positioner.style.getPropertyValue("--anchor-width")).toBe("220px");

    await press(options[1]!);
    if (started) {
      expect(onHandoffToEnvironment).toHaveBeenCalledExactlyOnceWith("remote");
      expect(onEnvironmentChange).not.toHaveBeenCalled();
    } else {
      expect(onEnvironmentChange).toHaveBeenCalledExactlyOnceWith("remote");
      expect(onHandoffToEnvironment).not.toHaveBeenCalled();
    }

    await press(row);
    const create = [...document.querySelectorAll<HTMLElement>('[role="listbox"] button')].find(
      (button) => button.textContent?.includes("New cloud session"),
    )!;
    await press(create);
    expect(onCreateCloudSession).toHaveBeenCalledExactlyOnceWith({ selectAsTarget: !started });

    // Escape closes it again.
    await press(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(row.getAttribute("aria-expanded")).toBe("false");
  } finally {
    for (const spy of spies) spy.mockRestore();
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

const identityFrom = (remoteName: string) =>
  ({
    canonicalKey: "github.com/acme/app",
    locator: { source: "git-remote", remoteName, remoteUrl: "git@github.com:acme/app.git" },
  }) as const;

// "Move to" a cloud machine, on the real menu: a connected machine (a choice) and a ready one not
// connected yet (a connect button). A project without an `origin` remote can't reach either (the
// server refuses on `origin` alone, so an upstream-only checkout is blocked too): both are shown
// disabled with the server's reason, no new cloud session is offered, and nothing moves.
it.each([
  ["with an origin remote moves to the cloud machine", identityFrom("origin")],
  ["with only an upstream remote is refused on the row", identityFrom("upstream")],
  ["without a git remote is refused on the row", null],
] as const)("a started thread %s", async (_, repositoryIdentity) => {
  const projectHasRemote = t3teamProjectHasOriginRemote(repositoryIdentity);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onHandoffToEnvironment = vi.fn();
  const onConnectCloudSession = vi.fn();
  const onCreateCloudSession = vi.fn();
  const onSetupProjectMachine = vi.fn();
  const session = (id: string, name: string) =>
    ({
      sessionId: id,
      name,
      phase: "ready",
      environmentId: `env-${id}`,
      machineLabel: "ubuntu-slim",
      remainingSeconds: null,
    }) as unknown as CloudSession;
  const connected = session("cloud-a", "cloud-a");
  const notConnected = session("cloud-b", "cloud-b");
  try {
    await act(async () => {
      root.render(
        <BranchToolbarEnvironmentSelector
          displayMode="panel"
          envLocked
          environmentId={EnvironmentId.make("local")}
          availableEnvironments={["local", "env-cloud-a"].map((id) => ({
            environmentId: EnvironmentId.make(id),
            projectId: ProjectId.make("project"),
            label: id,
            isPrimary: id === "local",
            machine: id === "local" ? "server" : "cloud",
          }))}
          pendingCloudSessions={[connected, notConnected]}
          connectedEnvironmentIds={new Set(["local", "env-cloud-a"])}
          cloudEnvironmentIds={new Set(["env-cloud-a", "env-cloud-b"])}
          onCreateCloudSession={onCreateCloudSession}
          onSetupProjectMachine={onSetupProjectMachine}
          onHandoffToEnvironment={onHandoffToEnvironment}
          onConnectCloudSession={onConnectCloudSession}
          projectHasRemote={projectHasRemote}
        />,
      );
    });
    const row = container.querySelector('[aria-label="Run on"]')!;
    await press(row);
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
    const options = () =>
      [...listbox.querySelectorAll<HTMLElement>('[role="option"]')].map((o) => o.textContent);
    const rowNamed = (name: string) =>
      [...listbox.querySelectorAll<HTMLElement>("button, [aria-disabled]")].find((element) =>
        element.textContent?.startsWith(name),
      )!;

    if (projectHasRemote) {
      expect(options()).toEqual(["local", "cloud-aReady · ubuntu-slim"]);
      expect(listbox.textContent).not.toContain(T3TEAM_THREAD_HANDOFF_NO_GIT_REMOTE_MESSAGE);
      expect(listbox.textContent).toContain("New cloud session");
      await press(rowNamed("cloud-b"));
      expect(onConnectCloudSession).toHaveBeenCalledExactlyOnceWith(notConnected);
      await press(row);
      const cloudOption = [
        ...document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]'),
      ].find((option) => option.textContent?.startsWith("cloud-a"))!;
      await press(cloudOption);
      expect(onHandoffToEnvironment).toHaveBeenCalledExactlyOnceWith("env-cloud-a");
    } else {
      // Only this computer is still a choice; both cloud rows say why they are not.
      expect(options()).toEqual(["local"]);
      for (const name of ["cloud-a", "cloud-b"]) {
        const blocked = rowNamed(name);
        expect(blocked.getAttribute("aria-disabled")).toBe("true");
        expect(blocked.textContent).toContain(T3TEAM_THREAD_HANDOFF_NO_GIT_REMOTE_MESSAGE);
        await press(blocked);
      }
      // No paid machine is started for a move that could not use it.
      expect(listbox.textContent).not.toContain("New cloud session");
      expect(
        [...listbox.querySelectorAll("button")].map((button) => button.textContent),
      ).not.toContainEqual(expect.stringContaining("set up"));
      expect(onConnectCloudSession).not.toHaveBeenCalled();
      expect(onHandoffToEnvironment).not.toHaveBeenCalled();
      expect(onCreateCloudSession).not.toHaveBeenCalled();
      expect(onSetupProjectMachine).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
