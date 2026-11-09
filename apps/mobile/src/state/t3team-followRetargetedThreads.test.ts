import * as NodeModule from "node:module";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  rootState: null as unknown,
  drafts: {} as Record<string, unknown>,
  merge: vi.fn(async (..._args: unknown[]) => ({ skippedAttachmentCount: 0 })),
  settings: vi.fn(),
  clear: vi.fn((key: string, _options?: unknown) => {
    delete mocks.drafts[key];
  }),
  order: [] as string[],
}));
// The real action creators; the React Native entry does not load under Node.
vi.mock("@react-navigation/native", () => {
  const requireNavigation = NodeModule.createRequire(
    NodeModule.createRequire(import.meta.url).resolve("@react-navigation/native/package.json"),
  );
  return { CommonActions: requireNavigation("@react-navigation/routers").CommonActions };
});
vi.mock("../lib/rootNavigation", () => ({
  rootNavigationRef: {
    getRootState: () => mocks.rootState,
    dispatch: (action: unknown) => {
      mocks.order.push("route");
      mocks.dispatch(action);
    },
  },
  whenRootNavigationReady: (navigate: () => void) => navigate(),
}));
vi.mock("./use-composer-drafts", () => ({
  getComposerDraftSnapshot: (key: string) => mocks.drafts[key] ?? { text: "", attachments: [] },
  isComposerDraftEmpty: (draft: { text: string; attachments: unknown[] }) =>
    draft.text === "" && draft.attachments.length === 0,
  mergeComposerDraftContent: (...args: unknown[]) => {
    mocks.order.push("draft");
    return mocks.merge(...args);
  },
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
  mocks.merge.mockReset().mockResolvedValue({ skippedAttachmentCount: 0 });
  mocks.order = [];
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

  it("still follows the routes when moving the composer draft fails, keeping the text", async () => {
    mocks.rootState = { routes: [threadRoute("open", "pending-env")] };
    mocks.drafts["pending-env:new-thread"] = { text: "and the docs", attachments: [] };
    mocks.merge.mockRejectedValueOnce(new Error("disk full"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await followRetargetedThreads(from, to, [ThreadId.make("new-thread")])).toBe(false);
    expect(mocks.dispatch).toHaveBeenCalledOnce();
    expect(mocks.merge).toHaveBeenLastCalledWith("pending-env:new-thread", {
      text: "and the docs",
      attachments: [],
    });
  });

  it("switches the open routes before it awaits a composer draft write", async () => {
    mocks.rootState = { routes: [threadRoute("open", "pending-env")] };
    mocks.drafts["pending-env:new-thread"] = { text: "and the docs", attachments: [] };
    expect(await followRetargetedThreads(from, to, [ThreadId.make("new-thread")])).toBe(true);
    expect(mocks.order).toEqual(["route", "draft"]);
  });

  it("keeps text typed on the old key during the write and reports the move unfinished", async () => {
    mocks.rootState = { routes: [] };
    mocks.drafts["pending-env:new-thread"] = { text: "and the docs", attachments: [] };
    mocks.merge.mockImplementationOnce(async () => {
      mocks.drafts["pending-env:new-thread"] = { text: "typed late", attachments: [] };
      return { skippedAttachmentCount: 0 };
    });
    expect(await followRetargetedThreads(from, to, [ThreadId.make("new-thread")])).toBe(false);
    expect(mocks.drafts["pending-env:new-thread"]).toEqual({ text: "typed late", attachments: [] });
    expect(mocks.merge).toHaveBeenCalledExactlyOnceWith("machine:new-thread", {
      text: "and the docs",
      attachments: [],
    });
  });

  it("leaves an empty thread composer alone", async () => {
    mocks.rootState = { routes: [] };
    await followRetargetedThreads(from, to, [ThreadId.make("new-thread")]);
    expect(mocks.merge).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});
