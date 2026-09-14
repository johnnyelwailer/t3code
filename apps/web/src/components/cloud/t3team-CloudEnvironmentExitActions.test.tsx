// @vitest-environment jsdom
import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CloudEnvironmentExitActions } from "./t3team-CloudEnvironmentExitActions";

const ENV = EnvironmentId.make("env-cloud-1");

type Handlers = ReturnType<typeof makeHandlers>;

function makeHandlers() {
  return {
    onConnect: vi.fn((_environmentId: EnvironmentId) => undefined),
    onRemove: vi.fn((_environmentId: EnvironmentId) => undefined),
    onStopCloudSession: vi.fn((_environmentId: EnvironmentId) => undefined),
  };
}

let root: Root | null = null;
let container: HTMLElement | null = null;

function mount(props: Partial<Parameters<typeof CloudEnvironmentExitActions>[0]> = {}) {
  const handlers = makeHandlers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const base: Parameters<typeof CloudEnvironmentExitActions>[0] = {
    environmentId: ENV,
    isConnected: true,
    isConnecting: false,
    isRemoving: false,
    canStopCloudSession: true,
    isStoppingCloudSession: false,
    onConnect: handlers.onConnect,
    onRemove: handlers.onRemove,
    onStopCloudSession: handlers.onStopCloudSession,
    ...props,
  };
  act(() => {
    root?.render(<CloudEnvironmentExitActions {...base} />);
  });
  return handlers;
}

function byAriaLabel(label: string): HTMLButtonElement | null {
  return container?.querySelector(`button[aria-label="${label}"]`) ?? null;
}

function findTextButton(text: string): HTMLButtonElement | null {
  if (container === null) return null;
  return (
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text) ?? null
  );
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe("CloudEnvironmentExitActions", () => {
  it("offers both 'Stop this machine' and 'Forget this environment' for a live machine", () => {
    mount();
    expect(byAriaLabel("Stop this machine")).not.toBeNull();
    expect(byAriaLabel("Forget this environment")).not.toBeNull();
  });

  it("hides Stop when there is no live session behind the machine, but keeps Forget", () => {
    mount({ canStopCloudSession: false });
    expect(byAriaLabel("Stop this machine")).toBeNull();
    expect(byAriaLabel("Forget this environment")).not.toBeNull();
  });

  it("shows a Connect button when the machine is not connected, and omits it when connected", () => {
    const disconnected = mount({ isConnected: false });
    expect(findTextButton("Connect")).not.toBeNull();
    click(findTextButton("Connect")!);
    expect(disconnected.onConnect).toHaveBeenCalledWith(ENV);

    mount();
    expect(findTextButton("Connect")).toBeNull();
  });

  it("stops the machine (and nothing else) when 'Stop this machine' is clicked", () => {
    const handlers = mount();
    click(byAriaLabel("Stop this machine")!);
    expect(handlers.onStopCloudSession).toHaveBeenCalledWith(ENV);
    expect(handlers.onRemove).not.toHaveBeenCalled();
  });

  it("forgets (removes) the environment — and does not stop it — when 'Forget' is clicked", () => {
    const handlers = mount();
    click(byAriaLabel("Forget this environment")!);
    expect(handlers.onRemove).toHaveBeenCalledWith(ENV);
    expect(handlers.onStopCloudSession).not.toHaveBeenCalled();
  });

  it("dims both verbs while either the stop or the remove is in flight", () => {
    mount({ isStoppingCloudSession: true });
    expect(byAriaLabel("Stop this machine")?.disabled).toBe(true);
    expect(byAriaLabel("Forget this environment")?.disabled).toBe(true);
  });
});
