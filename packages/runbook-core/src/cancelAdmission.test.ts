import { describe, expect, it } from "vite-plus/test";
import { createDurableRuntime } from "./durableRuntime.ts";
import { WorkflowAborted } from "./errors.ts";
import type { JournalSink } from "./journalStore.ts";
import type { ReplyResolver } from "./handles.ts";

const source = { now: () => 0, random: () => 0.5, uuid: () => "uuid" };

describe("durable result admission", () => {
  it("fences a reply resolved after the broker returned before decoding it", async () => {
    let resolver: ReplyResolver | undefined;
    let replyQueued = false;
    let decoded = false;
    const writer: JournalSink = {
      append: () => {},
      appendResolved: () => {
        replyQueued = true;
      },
      flush: async () => {
        if (replyQueued) throw new WorkflowAborted();
      },
      dispose: () => {},
    };
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer,
      source,
      runId: "late-resolver",
    });
    const id = await runtime.handles.send({
      kind: "thread.turn",
      refId: "model",
      args: {},
      fire: async (_id, reply) => {
        resolver = reply;
      },
    });
    if (!resolver) throw new Error("broker did not receive a resolver");
    resolver.resolve({ answer: "late" });
    await expect(
      runtime.handles.awaitResolution(id, async () => {
        decoded = true;
        return "decoded";
      }),
    ).rejects.toBeInstanceOf(WorkflowAborted);
    expect(decoded).toBe(false);
  });
  it("does not fire a broker when its dispatch intent was refused by the store", async () => {
    let fired = 0;
    const writer: JournalSink = {
      append: () => {},
      appendResolved: () => {},
      flush: async () => {
        throw new WorkflowAborted();
      },
      dispose: () => {},
    };
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer,
      source,
      runId: "cancelled",
    });
    await expect(
      runtime.handles.send({
        kind: "thread.turn",
        refId: "model",
        args: {},
        fire: async () => {
          fired += 1;
        },
      }),
    ).rejects.toBeInstanceOf(WorkflowAborted);
    expect(fired).toBe(0);
  });

  it("does not release a late model reply to the workflow when the store refuses it", async () => {
    let cancelled = false;
    let replyQueued = false;
    let subsequentEffect = 0;
    const writer: JournalSink = {
      append: () => {},
      appendResolved: () => {
        replyQueued = true;
      },
      flush: async () => {
        if (cancelled && replyQueued) throw new WorkflowAborted();
      },
      dispose: () => {},
    };
    const runtime = createDurableRuntime({ journal: new Map(), writer, source, runId: "inflight" });
    const body = async () => {
      const correlation = await runtime.handles.send({
        kind: "thread.turn",
        refId: "model",
        args: {},
        fire: async (_id, resolver) => {
          cancelled = true;
          resolver.resolve({ answer: "too late" });
        },
      });
      await runtime.handles.awaitResolution(correlation, undefined);
      subsequentEffect += 1;
    };
    await expect(body()).rejects.toBeInstanceOf(WorkflowAborted);
    expect(subsequentEffect).toBe(0);
  });

  it("does not release a primitive result or completion event before durable acceptance", async () => {
    const events: string[] = [];
    let appended = false;
    const writer: JournalSink = {
      append: () => {
        appended = true;
      },
      appendResolved: () => {},
      flush: async () => {
        if (appended) throw new WorkflowAborted();
      },
      dispose: () => {},
    };
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer,
      source,
      runId: "publish",
      events: {
        on: (event) => {
          events.push(event.type);
        },
      },
    });
    await expect(
      runtime.callPrimitive({
        kind: "artifact",
        refId: "record",
        args: {},
        exec: async () => ({ version: 2 }),
      }),
    ).rejects.toBeInstanceOf(WorkflowAborted);
    expect(events).toEqual(["primitive.started"]);
  });
});
