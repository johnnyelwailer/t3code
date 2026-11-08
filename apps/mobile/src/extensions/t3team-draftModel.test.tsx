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
  hasSelectableModel,
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

it("refuses an instance id the contracts cannot brand, with a result, and stores nothing", () => {
  const result = setDraftModelSelection("draft:seam-2", { instanceId: "Not A Slug!", model: "m" });
  expect(result).toEqual({ ok: false, reason: "invalid-instance-id" });
  expect(readDraftModelSelection("draft:seam-2")).toBeNull();
});

it("reports a stored model as ok", () => {
  expect(setDraftModelSelection("draft:seam-4", { instanceId: "codex", model: "m" })).toEqual({
    ok: true,
  });
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
  });
  expect(seen.at(-1)).toEqual({ instanceId: "codex", model: "gpt-6-astra" });
  unmount();
});

it("useStickyModelSelection reads without a stored pick as null", () => {
  const { seen, unmount } = renderHook(() => useStickyModelSelection());
  expect(seen.at(-1)).toBeNull();
  unmount();
});

const provider = (over: Record<string, unknown> = {}) => ({
  instanceId: "codex",
  driver: "codex",
  enabled: true,
  installed: true,
  auth: { status: "authenticated" },
  models: [{ slug: "m-1", name: "m-1", isCustom: false }],
  ...over,
});
const config = (providers: ReadonlyArray<unknown>) => ({ providers }) as never;

it("hasSelectableModel is the stock filter: a model the draft screen could pick", () => {
  expect(hasSelectableModel(null, null)).toBe(false);
  expect(hasSelectableModel(config([]), null)).toBe(false);
  expect(hasSelectableModel(config([provider()]), "p-1")).toBe(true);
  expect(hasSelectableModel(config([provider()]), null)).toBe(true);
  // A bad project id is no project, not a crash.
  expect(hasSelectableModel(config([provider()]), "Not A Slug!")).toBe(true);
});

it("hasSelectableModel is false where the stock screen would have no model", () => {
  expect(hasSelectableModel(config([provider({ enabled: false })]), null)).toBe(false);
  expect(hasSelectableModel(config([provider({ installed: false })]), null)).toBe(false);
  expect(
    hasSelectableModel(config([provider({ auth: { status: "unauthenticated" } })]), null),
  ).toBe(false);
  // Installed and signed in but listing no model: enabled+installed is looser than a pickable model.
  expect(hasSelectableModel(config([provider({ models: [] })]), null)).toBe(false);
});
