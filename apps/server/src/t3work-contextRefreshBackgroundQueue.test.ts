import { describe, expect, it } from "@effect/vitest";

import {
  getT3workContextBackgroundJob,
  listActiveT3workContextBackgroundJobs,
  releaseT3workContextBackgroundJobIfIdle,
} from "./t3work-contextRefreshBackgroundQueue.ts";

describe("releaseT3workContextBackgroundJobIfIdle", () => {
  it("removes a finished, empty-queue job from the active job registry", () => {
    const workspaceRoot = "/tmp/t3work-queue-test-idle";
    const rootKey = "IES-1";
    const job = getT3workContextBackgroundJob({ workspaceRoot, rootKey });
    expect(listActiveT3workContextBackgroundJobs()).toContain(job);

    job.running = false;
    releaseT3workContextBackgroundJobIfIdle({ workspaceRoot, rootKey }, job);

    expect(listActiveT3workContextBackgroundJobs()).not.toContain(job);
  });

  it("keeps a still-running job registered", () => {
    const workspaceRoot = "/tmp/t3work-queue-test-running";
    const rootKey = "IES-2";
    const job = getT3workContextBackgroundJob({ workspaceRoot, rootKey });
    job.running = true;

    releaseT3workContextBackgroundJobIfIdle({ workspaceRoot, rootKey }, job);

    expect(listActiveT3workContextBackgroundJobs()).toContain(job);
  });

  it("keeps a job with a non-empty queue registered", () => {
    const workspaceRoot = "/tmp/t3work-queue-test-nonempty";
    const rootKey = "IES-3";
    const job = getT3workContextBackgroundJob({ workspaceRoot, rootKey });
    job.running = false;
    job.queue.push({ resourceKey: "IES-4", depth: 1, enqueuedAt: 0 });

    releaseT3workContextBackgroundJobIfIdle({ workspaceRoot, rootKey }, job);

    expect(listActiveT3workContextBackgroundJobs()).toContain(job);
  });

  it("does not remove the registered job when passed a different (stale) job instance for the same key", () => {
    const workspaceRoot = "/tmp/t3work-queue-test-replaced";
    const rootKey = "IES-5";
    const registeredJob = getT3workContextBackgroundJob({ workspaceRoot, rootKey });

    // A job object that is no longer the one registered under this key
    // (e.g. superseded by a later kick) must not evict the real entry.
    const staleJob = {
      jobId: "stale",
      rootKey,
      queue: [],
      seen: new Set<string>(),
      running: false,
    };

    releaseT3workContextBackgroundJobIfIdle({ workspaceRoot, rootKey }, staleJob);

    expect(listActiveT3workContextBackgroundJobs()).toContain(registeredJob);
  });
});
