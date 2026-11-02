import { RegistryContext } from "@effect/atom-react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("expo-file-system", () => ({
  Directory: class {
    create() {}
  },
  File: class {
    exists = false;
    parentDirectory = null;
    create() {}
    moveSync() {}
    async text() {
      return "";
    }
    write() {}
  },
  Paths: { document: "/documents" },
}));

import { appAtomRegistry } from "../state/atom-registry";
import {
  readDraftModelSelection,
  setDraftModelSelection,
  useDraftModelSelection,
  useStickyModelSelection,
} from "./t3team-draftModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<A>(hook: () => A): { readonly seen: A[]; readonly unmount: () => void } {
  const seen: A[] = [];
  const Probe = () => {
    seen.push(hook());
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      <RegistryContext.Provider value={appAtomRegistry}>
        <Probe />
      </RegistryContext.Provider>,
    ),
  );
  return { seen, unmount: () => act(() => root.unmount()) };
}

it("stores a model on a draft by plain ids and reads it back", () => {
  expect(readDraftModelSelection("draft:seam-1")).toBeNull();
  setDraftModelSelection("draft:seam-1", { instanceId: "claudeAgent", model: "claude-sonnet-5-5" });
  expect(readDraftModelSelection("draft:seam-1")).toEqual({
    instanceId: "claudeAgent",
    model: "claude-sonnet-5-5",
  });
});

it("brands the instance id: an id the contracts refuse is rejected, not stored", () => {
  expect(() =>
    setDraftModelSelection("draft:seam-2", { instanceId: "Not A Slug!", model: "m" }),
  ).toThrow();
  expect(readDraftModelSelection("draft:seam-2")).toBeNull();
});

it("useDraftModelSelection(null) does not throw and has no model (useComposerDraft keys a null draft to the empty draft)", () => {
  const { seen, unmount } = renderHook(() => useDraftModelSelection(null));
  expect(seen.at(-1)).toBeNull();
  unmount();
});

it("useDraftModelSelection follows what is stored on the draft, as plain ids", async () => {
  const { seen, unmount } = renderHook(() => useDraftModelSelection("draft:seam-3"));
  expect(seen.at(-1)).toBeNull();
  await act(async () => {
    setDraftModelSelection("draft:seam-3", { instanceId: "codex", model: "gpt-6-astra" });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(seen.at(-1)).toEqual({ instanceId: "codex", model: "gpt-6-astra" });
  unmount();
});

it("useStickyModelSelection reads without a stored pick as null", () => {
  const { seen, unmount } = renderHook(() => useStickyModelSelection());
  expect(seen.at(-1)).toBeNull();
  unmount();
});
