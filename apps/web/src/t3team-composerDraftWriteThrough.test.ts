// @vitest-environment jsdom
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  COMPOSER_DRAFT_STORAGE_KEY,
  DraftId,
  flushComposerDraftStorage,
  useComposerDraftStore,
} from "~/composerDraftStore";

function persistedPrompt(key: string): string | null {
  const raw = window.localStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as {
    state: { draftsByThreadKey: Record<string, { prompt?: string }> };
  };
  return parsed.state.draftsByThreadKey[key]?.prompt ?? null;
}

describe("composer draft write-through for new-thread drafts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    useComposerDraftStore.setState({ draftsByThreadKey: {}, draftThreadsByThreadKey: {} });
  });
  afterEach(() => {
    flushComposerDraftStorage();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("persists a new-thread prompt synchronously, before any debounce elapses", () => {
    const draftId = DraftId.make("draft-write-through");
    useComposerDraftStore.getState().setPrompt(draftId, "Plan the release notes");
    // No timer advance: a kill right now must not lose the text.
    expect(persistedPrompt("draft-write-through")).toBe("Plan the release notes");
  });

  it("keeps the debounce for existing-thread drafts, and a pagehide flushes it", () => {
    const threadRef = scopeThreadRef(
      EnvironmentId.make("environment-local"),
      ThreadId.make("thread-existing"),
    );
    useComposerDraftStore.getState().setPrompt(threadRef, "follow-up question");
    const key = scopedThreadKey(threadRef);
    expect(persistedPrompt(key)).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    expect(persistedPrompt(key)).toBe("follow-up question");
  });
});
