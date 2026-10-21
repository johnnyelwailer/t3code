import { describe, expect, it } from "vite-plus/test";

import { voiceStreamStatusText } from "./t3team-VoiceStreamStatus";

describe("voiceStreamStatusText", () => {
  it("says listening until a partial arrives, then shows it", () => {
    expect(voiceStreamStatusText("recording", "")).toBe("Listening…");
    expect(voiceStreamStatusText("recording", "open the board")).toBe("open the board");
  });

  it("says finalizing while the stop-time pass runs", () => {
    expect(voiceStreamStatusText("transcribing", "open the board")).toBe("Finalizing…");
  });

  it("says nothing in any other phase", () => {
    expect(voiceStreamStatusText("idle", "x")).toBeNull();
    expect(voiceStreamStatusText("preparing", "x")).toBeNull();
    expect(voiceStreamStatusText("error", "x")).toBeNull();
  });
});
