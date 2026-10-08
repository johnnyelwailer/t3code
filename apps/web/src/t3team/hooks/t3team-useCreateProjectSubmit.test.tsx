// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi } from "~/t3team/backend/t3team-types";

const backendRef: { current: BackendApi | null } = { current: {} as BackendApi };
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("~/t3team/backend/t3team-index", () => ({ useBackend: () => backendRef.current }));
vi.mock("./t3team-createJiraProject", () => ({ createJiraProject: mockCreate }));

import { useCreateProjectSubmit } from "./t3team-useCreateProjectSubmit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Hook = ReturnType<typeof useCreateProjectSubmit>;

let root: Root | null = null;
const input = { entry: {} as never, linkedRepositoryUrls: [], setupProfileId: "product-partner" };

function render(scope: string | undefined) {
  const current: { value: Hook | null } = { value: null };
  // One component identity, so changing the scope re-renders the same hook instance.
  function Probe({ scopeKey }: { scopeKey: string | undefined }) {
    current.value = useCreateProjectSubmit(scopeKey);
    return null;
  }
  root = createRoot(document.createElement("div"));
  const show = (next: string | undefined) =>
    act(() => {
      root!.render(createElement(Probe, { scopeKey: next }));
    });
  show(scope);
  return { current, show };
}

beforeEach(() => mockCreate.mockReset());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe("useCreateProjectSubmit", () => {
  it("never runs two creates at once", async () => {
    let finish: (project: unknown) => void = () => {};
    mockCreate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { current } = render("a::1");

    let first: Promise<unknown> = Promise.resolve();
    await act(async () => {
      first = current.value!.submit(input);
      void current.value!.submit(input);
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(current.value!.state.kind).toBe("creating");
    await act(async () => {
      finish({ id: "p1" });
      await first;
    });
  });

  it("keeps a failure on the project it happened for and allows a retry", async () => {
    mockCreate.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ id: "p1" });
    const { current, show } = render("a::1");

    await act(async () => {
      expect(await current.value!.submit(input)).toBeNull();
    });
    expect(current.value!.state).toEqual({ kind: "error", error: expect.any(Error) });

    show("a::2");
    expect(current.value!.state.kind).toBe("idle");
    show("a::1");
    expect(current.value!.state.kind).toBe("error");

    await act(async () => {
      expect(await current.value!.submit(input)).toEqual({ id: "p1" });
    });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("shows a running create whichever project is on screen", async () => {
    let finish: (project: unknown) => void = () => {};
    mockCreate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { current, show } = render("a::1");
    let running: Promise<unknown> = Promise.resolve();
    // The create starts (and flips the state) synchronously; it finishes when the test says so.
    act(() => {
      running = current.value!.submit(input);
    });
    show(undefined);
    expect(current.value!.state.kind).toBe("creating");
    await act(async () => {
      finish({ id: "p1" });
      await running;
    });
  });
});
