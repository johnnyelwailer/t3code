// @vitest-environment jsdom
import { describe, expect, it, vi } from "vite-plus/test";

import {
  installComposerDraftFlushTriggers,
  shouldWriteThroughComposerDraft,
} from "~/t3team/composer/t3team-composerDraftFlushTriggers";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

describe("installComposerDraftFlushTriggers", () => {
  it("flushes on beforeunload, pagehide, blur and when the page is hidden", () => {
    const flush = vi.fn();
    const dispose = installComposerDraftFlushTriggers(flush, { window, document });
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("blur"));
    expect(flush).toHaveBeenCalledTimes(3);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).toHaveBeenCalledTimes(3);
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).toHaveBeenCalledTimes(4);

    dispose();
    window.dispatchEvent(new Event("pagehide"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).toHaveBeenCalledTimes(4);
  });

  it("is a no-op without window/document (SSR, workers)", () => {
    const flush = vi.fn();
    const dispose = installComposerDraftFlushTriggers(flush, {
      window: undefined,
      document: undefined,
    });
    dispose();
    expect(flush).not.toHaveBeenCalled();
  });
});

describe("shouldWriteThroughComposerDraft", () => {
  it("writes through new-thread (DraftId) targets only", () => {
    expect(shouldWriteThroughComposerDraft("draft-123")).toBe(true);
    expect(shouldWriteThroughComposerDraft("  ")).toBe(false);
    expect(shouldWriteThroughComposerDraft({ environmentId: "e", threadId: "t" })).toBe(false);
  });
});
