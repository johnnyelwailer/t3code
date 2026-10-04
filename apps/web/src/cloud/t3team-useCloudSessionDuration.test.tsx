// @vitest-environment jsdom
import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_CLOUD_SESSION_DURATION_SECONDS } from "~/components/cloud/t3team-CloudSessionProvisionPanel";
import {
  CLOUD_SESSION_DURATION_BY_ENVIRONMENT_KEY,
  resolveCloudSessionDuration,
  useCloudSessionDuration,
} from "./t3team-useCloudSessionDuration";

const ENV_A = EnvironmentId.make("env-a");
const ENV_B = EnvironmentId.make("env-b");

let root: Root | null = null;
let container: HTMLElement | null = null;
let captured: ReturnType<typeof useCloudSessionDuration> | null = null;

function Probe({ environmentId }: { environmentId: EnvironmentId | null }) {
  captured = useCloudSessionDuration(environmentId);
  return null;
}

function mount(environmentId: EnvironmentId | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Probe environmentId={environmentId} />);
  });
}

function unmount() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("useCloudSessionDuration", () => {
  it("starts at the default when nothing was picked yet", () => {
    mount(ENV_A);
    expect(captured![0]).toBe(DEFAULT_CLOUD_SESSION_DURATION_SECONDS);
  });

  it("remembers the last choice per environment across a remount (a reload)", () => {
    mount(ENV_A);
    act(() => captured![1](8 * 3600));
    expect(captured![0]).toBe(8 * 3600);
    unmount();

    mount(ENV_A);
    expect(captured![0]).toBe(8 * 3600);
    unmount();

    // Another environment keeps its own choice.
    mount(ENV_B);
    expect(captured![0]).toBe(DEFAULT_CLOUD_SESSION_DURATION_SECONDS);
  });

  it("ignores a stored value the picker no longer offers", () => {
    window.localStorage.setItem(
      CLOUD_SESSION_DURATION_BY_ENVIRONMENT_KEY,
      JSON.stringify({ [String(ENV_A)]: 1234 }),
    );
    mount(ENV_A);
    expect(captured![0]).toBe(DEFAULT_CLOUD_SESSION_DURATION_SECONDS);
    expect(resolveCloudSessionDuration(3600)).toBe(3600);
  });
});
