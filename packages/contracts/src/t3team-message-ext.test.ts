/**
 * forkSource backward-compat: notes persisted before `parentSelection` /
 * `childSelection` existed must keep decoding, and new notes must carry the
 * machine-readable transition.
 */
import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamMessageExt } from "./t3team-message-ext.ts";

const decode = Schema.decodeUnknownSync(T3TeamMessageExt);

describe("T3TeamMessageExt.forkSource", () => {
  it("decodes a legacy note without the selection fields", () => {
    const ext = decode({
      forkSource: {
        threadId: "thread-1",
        threadTitle: "Parent",
        omittedMessageCount: 4,
      },
    });
    expect(ext.forkSource).toEqual({
      threadId: "thread-1",
      threadTitle: "Parent",
      omittedMessageCount: 4,
    });
  });

  it("decodes a new note carrying both selections", () => {
    const ext = decode({
      forkSource: {
        threadId: "thread-1",
        threadTitle: "Parent",
        omittedMessageCount: 4,
        parentSelection: { instanceId: "claude", model: "claude-opus-4" },
        childSelection: { instanceId: "nexplore", model: "gpt-5" },
      },
    });
    expect(ext.forkSource?.parentSelection).toEqual({
      instanceId: "claude",
      model: "claude-opus-4",
    });
    expect(ext.forkSource?.childSelection).toEqual({
      instanceId: "nexplore",
      model: "gpt-5",
    });
  });

  it("rejects a malformed selection instance id", () => {
    expect(() =>
      decode({
        forkSource: {
          threadId: "thread-1",
          threadTitle: "Parent",
          parentSelection: { instanceId: "", model: "m" },
        },
      }),
    ).toThrow();
  });
});
