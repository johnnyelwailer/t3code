import { describe, expect, it } from "vite-plus/test";

import { readOnlyVoiceOutputSource, type VoiceOutputMessage } from "./t3team-voiceOutput.ts";

const replies: VoiceOutputMessage[] = [
  { id: "m1", role: "assistant", text: "first reply", isStreaming: false },
  { id: "m2", role: "agent", text: "thinking…", isStreaming: true },
];

describe("readOnlyVoiceOutputSource", () => {
  it("reads the most recent reply only", () => {
    const source = readOnlyVoiceOutputSource(() => replies);
    expect(source.latestReply()?.id).toBe("m2");
    expect(source.latestReply()?.text).toBe("thinking…");
  });

  it("reports responding only while the latest reply streams", () => {
    expect(readOnlyVoiceOutputSource(() => replies).isResponding()).toBe(true);
    expect(
      readOnlyVoiceOutputSource(() => [
        { id: "m1", role: "assistant", text: "done", isStreaming: false },
      ]).isResponding(),
    ).toBe(false);
  });

  it("is null-safe when there are no replies yet", () => {
    expect(readOnlyVoiceOutputSource(() => []).latestReply()).toBeNull();
    expect(readOnlyVoiceOutputSource(() => []).isResponding()).toBe(false);
  });
});
