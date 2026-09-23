/**
 * The host's drive slot against real replays: a reply that lands while another drive holds the
 * slot is journaled at once and replayed by an owed drive — never dropped, never driven twice
 * concurrently. The t3code reactor calls `run.resume` without serializing, so this is the case a
 * slow redrive (a whole replay plus a broker fire) otherwise loses.
 */

import { afterAll, describe, expect, it, vi } from "vite-plus/test";

import {
  appendResolvedEntry,
  createWorkflowHostRegistry,
  createWorkflowRunHost,
  type MessageEnvelope,
  type WorkflowHostLifecycle,
  type WorkflowRunHost,
} from "./t3team-sdk.index.ts";
import {
  askResponseWorkflow,
  cleanupRunsRoot,
  e2eReviewWorkflow,
  runsRoot,
} from "./t3team-sdk.engineFixtures.ts";
import { FsJournalStore } from "./t3team-sdk.journalStore.ts";

/**
 * The real fs store, plus an event when an ask's `sent` line is durable. The runtime writes
 * journal lines through an async chain, so a reply that lands INSIDE `broker.send` can precede
 * its own `sent` line; a test reply waits for this event instead of racing it.
 */
class SignallingStore extends FsJournalStore {
  private readonly stored = new Set<string>();
  private readonly waiters = new Map<string, () => void>();
  override async appendEntry(
    runId: string,
    entry: Parameters<FsJournalStore["appendEntry"]>[1],
  ): Promise<void> {
    await super.appendEntry(runId, entry);
    if (entry.phase !== "sent" || entry.correlationId === undefined) return;
    this.stored.add(entry.correlationId);
    this.waiters.get(entry.correlationId)?.();
  }
  sentStored(correlationId: string): Promise<void> {
    if (this.stored.has(correlationId)) return Promise.resolve();
    return new Promise((resolve) => this.waiters.set(correlationId, resolve));
  }
}

type Send = (envelope: MessageEnvelope, host: WorkflowRunHost) => Promise<void>;

/** A host whose broker never answers inline; `send` may act mid-drive. `log` is the timeline. */
function makeHost(
  runId: string,
  ref: typeof askResponseWorkflow | typeof e2eReviewWorkflow,
  seams: {
    /** Wraps the real journal write (e.g. to fail AFTER it committed). */
    readonly append?: (write: () => Promise<boolean>, attempt: number) => Promise<boolean>;
    readonly onReplyJournaled?: (correlationId: string) => Promise<void>;
  } = {},
) {
  let appendAttempts = 0;
  const orphanIfSleeping = vi.fn(async (_correlationId: string) => {});
  const log: string[] = [];
  const sent: MessageEnvelope[] = [];
  const hook: { send: Send } = { send: async () => {} };
  const store = new SignallingStore(runsRoot);
  const appendResolved = vi.fn(
    async (opts: { runId: string; correlationId: string; reply: unknown }) => {
      const write = () => appendResolvedEntry({ store, ...opts });
      appendAttempts += 1;
      const wrote = await (seams.append === undefined
        ? write()
        : seams.append(write, appendAttempts));
      log.push(`journaled ${opts.correlationId}`);
      return wrote;
    },
  );
  const lifecycle: WorkflowHostLifecycle = {
    recordRunning: async () => {},
    recordActive: async () => (log.push("drive"), true),
    releaseActive: () => {},
    recordCompleted: async () => {},
    recordFailed: async () => {},
    orphanIfSleeping,
  };
  const onCompleted = vi.fn(async (_result: { readonly result: unknown }) => {});
  const onFailed = vi.fn(
    async (_detail: { readonly phase: string; readonly error: unknown }) => {},
  );
  let host!: WorkflowRunHost;
  host = createWorkflowRunHost({
    ref,
    args: ref === e2eReviewWorkflow ? { change: "rewrite billing" } : { question: "ship it?" },
    runId,
    runOptions: {
      runsRoot,
      store,
      tools: [],
      launchThreadId: "launch-thread",
      broker: {
        send: async (envelope) => {
          sent.push(envelope);
          log.push(`fire ${envelope.kind}${envelope.redelivery === true ? " (refire)" : ""}`);
          await hook.send(envelope, host);
        },
      },
    },
    registry: createWorkflowHostRegistry(),
    lifecycle,
    sinks: { onCompleted, onFailed },
    appendResolved,
    ...(seams.onReplyJournaled === undefined ? {} : { onReplyJournaled: seams.onReplyJournaled }),
  });
  return { host, log, sent, hook, store, appendResolved, onCompleted, onFailed, orphanIfSleeping };
}

describe("durable workflow engine — replies that land mid-drive", () => {
  afterAll(cleanupRunsRoot);

  it("a resume during a redrive journals its reply and the run completes via the owed re-drive", async () => {
    const run = makeHost("host-resume-mid-redrive", askResponseWorkflow);
    expect(await run.host.start()).toBe("suspended");

    let resumeReturned = false;
    // The genuine reply lands while the redrive holds the slot (inside its re-fire).
    run.hook.send = async (envelope, host) => {
      if (envelope.redelivery !== true) return;
      await host.resume(envelope.correlationId, "yes");
      resumeReturned = true;
      run.log.push("resume returned");
    };
    await run.host.redrive({ refire: "host-resume-mid-redrive:1" });

    expect(resumeReturned).toBe(true);
    expect(run.appendResolved).toHaveBeenCalledOnce();
    expect(run.onCompleted).toHaveBeenCalledOnce();
    expect(run.onCompleted.mock.calls[0]?.[0].result).toEqual({ answer: "yes" });
    expect(run.onFailed).not.toHaveBeenCalled();
    // The reply was journaled before the redrive let go; the owed drive replayed it afterwards
    // without re-sending anything.
    expect(run.log).toEqual([
      "fire user.input",
      "drive",
      "fire user.input (refire)",
      "journaled host-resume-mid-redrive:1",
      "resume returned",
      "drive",
    ]);
  });

  it("two overlapping resumes both journal, and the run replays exactly once more", async () => {
    const run = makeHost("host-overlapping-resumes", e2eReviewWorkflow);
    const replies = [
      JSON.stringify({ risk: "high" }),
      JSON.stringify({ plan: "Ship behind a flag." }),
      JSON.stringify({ approved: true }),
    ];
    expect(await run.host.start()).toBe("suspended");
    const firstAsk = run.sent.find((envelope) => envelope.kind === "thread.turn");
    if (firstAsk === undefined) throw new Error("expected the first turn to fire");

    // While resume #1's drive fires the SECOND ask, its reply lands: resume #2 overlaps #1.
    run.hook.send = async (envelope, host) => {
      if (envelope.kind !== "thread.turn" || envelope.correlationId === firstAsk.correlationId)
        return;
      await run.store.sentStored(envelope.correlationId);
      await host.resume(envelope.correlationId, replies[1]);
      run.log.push("resume #2 returned");
    };
    await run.host.resume(firstAsk.correlationId, replies[0]);

    expect(run.appendResolved).toHaveBeenCalledTimes(2);
    // Resume #1's drive, then ONE owed replay that consumed reply #2 and parked on the user ask.
    expect(run.log.filter((line) => line === "drive")).toHaveLength(2);
    expect(run.log).toEqual([
      "fire thread.create",
      "fire thread.turn",
      "drive", // resume #1
      "journaled host-overlapping-resumes:2",
      "fire thread.turn", // resume #1's drive fires the second ask...
      "journaled host-overlapping-resumes:3", // ...whose reply lands mid-drive
      "resume #2 returned",
      "drive", // the one owed replay
      "fire user.input",
    ]);
    const userAsk = run.sent.find((envelope) => envelope.kind === "user.input");
    if (userAsk === undefined) throw new Error("expected the owed replay to reach the user ask");
    expect(run.onCompleted).not.toHaveBeenCalled();

    run.hook.send = async () => {};
    await run.host.resume(userAsk.correlationId, replies[2]);
    expect(run.onCompleted).toHaveBeenCalledOnce();
    expect(run.onCompleted.mock.calls[0]?.[0].result).toEqual({
      risk: "high",
      plan: "Ship behind a flag.",
      approved: true,
    });
    expect(run.onFailed).not.toHaveBeenCalled();
  });

  it("a failing onReplyJournaled after a durable append still replays: error reported once, run completes", async () => {
    const sinkDown = new Error("reply sink down");
    const onReplyJournaled = vi.fn(async () => {
      throw sinkDown;
    });
    const run = makeHost("host-callback-fails", askResponseWorkflow, { onReplyJournaled });
    expect(await run.host.start()).toBe("suspended");
    run.hook.send = async (envelope, host) => {
      if (envelope.redelivery === true) await host.resume(envelope.correlationId, "yes");
    };
    await run.host.redrive({ refire: "host-callback-fails:1" });

    expect(run.appendResolved).toHaveBeenCalledOnce(); // written once, never re-sent
    expect(onReplyJournaled).toHaveBeenCalledOnce();
    expect(run.onFailed).toHaveBeenCalledOnce();
    expect(run.onFailed.mock.calls[0]?.[0]).toEqual({ phase: "resume", error: sinkDown });
    expect(run.orphanIfSleeping).not.toHaveBeenCalled();
    expect(run.onCompleted).toHaveBeenCalledOnce();
    expect(run.onCompleted.mock.calls[0]?.[0].result).toEqual({ answer: "yes" });
  });

  it("an append that committed but threw is owed as a whole resume that replays its own reply", async () => {
    // Attempt 1 commits, then the transport fails; attempt 2 fails outright. The journal looked
    // unreachable, so the whole resume is owed — and its retry finds THIS reply already stored.
    const run = makeHost("host-append-committed", askResponseWorkflow, {
      append: async (write, attempt) => {
        if (attempt === 1) await write();
        if (attempt <= 2) throw new Error("transport reset");
        return write();
      },
    });
    expect(await run.host.start()).toBe("suspended");
    run.hook.send = async (envelope, host) => {
      if (envelope.redelivery === true) await host.resume(envelope.correlationId, "yes");
    };
    await run.host.redrive({ refire: "host-append-committed:1" });

    expect(run.appendResolved).toHaveBeenCalledTimes(3); // two failed attempts + the owed retry
    expect(run.orphanIfSleeping).not.toHaveBeenCalled();
    expect(run.onFailed).not.toHaveBeenCalled();
    expect(run.onCompleted).toHaveBeenCalledOnce();
    expect(run.onCompleted.mock.calls[0]?.[0].result).toEqual({ answer: "yes" });
  });
});
