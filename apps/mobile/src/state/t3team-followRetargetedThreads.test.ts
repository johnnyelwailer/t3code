import * as NodeModule from "node:module";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  rootState: null as unknown,
  drafts: {} as Record<string, unknown>,
  merge: vi.fn(async () => ({ skippedAttachmentCount: 0 })),
  settings: vi.fn(),
  clear: vi.fn(),
}));
// The real action creators; the React Native entry does not load under Node.
vi.mock("@react-navigation/native", () => {
  const requireNavigation = NodeModule.createRequire(
    NodeModule.createRequire(import.meta.url).resolve("@react-navigation/native/package.json"),
  );
  return { CommonActions: requireNavigation("@react-navigation/routers").CommonActions };
});
vi.mock("../lib/rootNavigation", () => ({
  rootNavigationRef: { getRootState: () => mocks.rootState, dispatch: mocks.dispatch },
  whenRootNavigationReady: (navigate: () => void) => navigate(),
}));
vi.mock("./use-composer-drafts", () => ({
  getComposerDraftSnapshot: (key: string) => mocks.drafts[key] ?? { text: "", attachments: [] },
  isComposerDraftEmpty: (draft: { text: string; attachments: unknown[] }) =>
    draft.text === "" && draft.attachments.length === 0,
  mergeComposerDraftContent: mocks.merge,
  updateComposerDraftSettings: mocks.settings,
  clearComposerDraft: mocks.clear,
}));

import { followRetargetedThreads } from "./t3team-followRetargetedThreads";

const from = EnvironmentId.make("pending-env");
const to = EnvironmentId.make("machine");
const threadRoute = (key: string, environmentId: string, threadId = "new-thread") => ({
  key,
  name: "Thread",
  params: { environmentId, threadId },
});

beforeEach(() => {
  mocks.dispatch.mockClear();
  mocks.merge.mockClear();
  mocks.settings.mockClear();
  mocks.clear.mockClear();
  mocks.drafts = {};
});

describe("followRetargetedThreads", () => {
  it("points every open route of a moved thread at the real environment", async () => {
    mocks.rootState = {
      routes: [
        { key: "home", name: "Home" },
        threadRoute("open", "pending-env"),
        {
          key: "tabs",
          name: "Workspace",
          state: { routes: [threadRoute("nested", "pending-env"), threadRoute("other", "laptop")] },
        },
        threadRoute("another-thread", "pending-env", "unrelated"),
      ],
    };
    await followRetargetedThreads(from, to, [ThreadId.make("new-thread")]);
    expect(mocks.dispatch.mock.calls.map(([action]) => [action.source, action.payload])).toEqual([
      ["open", { params: { environmentId: "machine" } }],
      ["nested", { params: { environmentId: "machine" } }],
    ]);
  });

  it("moves the thread composer's unsent text and settings to the real thread", async () => {
    mocks.rootState = { routes: [] };
    const context = { version: 1, records: [] };
    mocks.drafts["pending-env:new-thread"] = {
      text: "and the docs",
      context,
      attachments: [],
      runtimeMode: "full-access",
    };
    await followRetargetedThreads(from, to, [ThreadId.make("new-thread")]);
    expect(mocks.merge).toHaveBeenCalledExactlyOnceWith("machine:new-thread", {
      text: "and the docs",
      context,
      attachments: [],
    });
    expect(mocks.settings).toHaveBeenCalledExactlyOnceWith("machine:new-thread", {
      runtimeMode: "full-access",
    });
    expect(mocks.clear).toHaveBeenCalledExactlyOnceWith("pending-env:new-thread", {
      deferAttachmentCleanup: true,
    });
  });

  it("leaves an empty thread composer alone", async () => {
    mocks.rootState = { routes: [] };
    await followRetargetedThreads(from, to, [ThreadId.make("new-thread")]);
    expect(mocks.merge).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});
