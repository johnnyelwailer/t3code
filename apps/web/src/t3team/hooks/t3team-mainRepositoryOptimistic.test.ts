import { describe, expect, it } from "vite-plus/test";

import {
  beginMainPersist,
  canPersistMainRepositoryNow,
  setMainLocally,
  completeMainPersist,
  failMainPersist,
  initialMainOptimisticState,
  isMainPersistPending,
  MAIN_REPOSITORY_PERSIST_ERROR,
  persistErrorMessage,
  retryMainPersistUrl,
} from "./t3team-mainRepositoryOptimistic";

const ALPHA = "https://github.com/acme/alpha";
const BETA = "https://github.com/acme/beta";

describe("main repository optimistic persist", () => {
  it("shows the new main immediately and marks the persist pending", () => {
    const started = beginMainPersist(initialMainOptimisticState(ALPHA), BETA);
    expect(started.mainUrl).toBe(BETA);
    expect(started.committedUrl).toBe(ALPHA);
    expect(started.pendingUrl).toBe(BETA);
    expect(started.error).toBeNull();
    expect(isMainPersistPending(started)).toBe(true);
  });

  it("keeps the new main and clears pending on success", () => {
    const done = completeMainPersist(beginMainPersist(initialMainOptimisticState(ALPHA), BETA), BETA);
    expect(done.mainUrl).toBe(BETA);
    expect(done.committedUrl).toBe(BETA);
    expect(isMainPersistPending(done)).toBe(false);
    expect(done.error).toBeNull();
  });

  it("reverts to the previous main and exposes Retry after a failed Make main", () => {
    const failed = failMainPersist(beginMainPersist(initialMainOptimisticState(ALPHA), BETA));
    expect(failed.mainUrl).toBe(ALPHA);
    expect(failed.committedUrl).toBe(ALPHA);
    expect(isMainPersistPending(failed)).toBe(false);
    expect(failed.error).toEqual({ url: BETA, message: MAIN_REPOSITORY_PERSIST_ERROR });
    expect(retryMainPersistUrl(failed)).toBe(BETA);
  });

  it("retries from the failed URL: optimistic again, then success or another failure", () => {
    const failed = failMainPersist(beginMainPersist(initialMainOptimisticState(ALPHA), BETA));
    const retried = beginMainPersist(failed, retryMainPersistUrl(failed) ?? null);
    expect(retried.mainUrl).toBe(BETA);
    expect(retried.pendingUrl).toBe(BETA);
    expect(retried.error).toBeNull();
    expect(completeMainPersist(retried, BETA).committedUrl).toBe(BETA);

    const failedAgain = failMainPersist(retried);
    expect(failedAgain.mainUrl).toBe(ALPHA);
    expect(retryMainPersistUrl(failedAgain)).toBe(BETA);
  });

  it("keeps a promoted main when the previous one was unlinked, and still offers Retry", () => {
    const started = beginMainPersist(initialMainOptimisticState(BETA), ALPHA, false);
    const failed = failMainPersist(started);
    expect(failed.mainUrl).toBe(ALPHA);
    expect(failed.committedUrl).toBe(BETA);
    expect(failed.error).toEqual({ url: ALPHA, message: MAIN_REPOSITORY_PERSIST_ERROR });
    expect(retryMainPersistUrl(failed)).toBe(ALPHA);
  });

  it("treats clearing the main (no remaining linked repo) as a persist of null", () => {
    const started = beginMainPersist(initialMainOptimisticState(ALPHA), null);
    expect(started.mainUrl).toBeNull();
    expect(started.pendingUrl).toBeNull();
    expect(isMainPersistPending(started)).toBe(true);
    expect(completeMainPersist(started, null).committedUrl).toBeNull();
    const failed = failMainPersist(started);
    expect(failed.mainUrl).toBe(ALPHA);
    expect(retryMainPersistUrl(failed)).toBeNull();
  });

  it("persists a saved linked URL immediately, and defers one that is not yet saved", () => {
    expect(canPersistMainRepositoryNow(ALPHA, [ALPHA, BETA])).toBe(true);
    expect(canPersistMainRepositoryNow(null, [ALPHA])).toBe(true);
    expect(canPersistMainRepositoryNow(ALPHA, [])).toBe(false);
    expect(canPersistMainRepositoryNow(ALPHA, [BETA])).toBe(false);
  });

  it("records a local main without marking a persist pending", () => {
    const local = setMainLocally(initialMainOptimisticState(null), ALPHA);
    expect(local.mainUrl).toBe(ALPHA);
    expect(local.committedUrl).toBeNull();
    expect(isMainPersistPending(local)).toBe(false);
  });

  it("uses the same plain error copy for any failure", () => {
    expect(persistErrorMessage(new Error("ECONNRESET"))).toBe(MAIN_REPOSITORY_PERSIST_ERROR);
    expect(persistErrorMessage("nope")).toBe(MAIN_REPOSITORY_PERSIST_ERROR);
  });
});
