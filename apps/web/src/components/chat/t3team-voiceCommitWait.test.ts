import { describe, expect, it } from "vite-plus/test";

import { waitForVoiceAttachment } from "./t3team-voiceCommitWait";

/** Manual frame pump: schedules callbacks without a real rAF clock. */
function makeFrameDriver() {
  const queued: Array<() => void> = [];
  return {
    nextFrame: (callback: () => void) => {
      queued.push(callback);
    },
    tick() {
      const frame = queued.shift();
      expect(frame, "expected a queued frame callback").toBeDefined();
      frame?.();
    },
    get pending() {
      return queued.length;
    },
  };
}

describe("waitForVoiceAttachment", () => {
  it("resolves synchronously when the attachment is already in the refs", async () => {
    const driver = makeFrameDriver();
    const result = await waitForVoiceAttachment(new Set(["existing"]), {
      observe: () => ["existing", "voice-note"],
      nextFrame: driver.nextFrame,
    });
    expect(result).toBe(true);
    expect(driver.pending).toBe(0);
  });

  it("resolves true when a new attachment id appears on a later frame", async () => {
    const driver = makeFrameDriver();
    let frames = 0;
    const pending = waitForVoiceAttachment(new Set(["existing"]), {
      observe: () => {
        frames += 1;
        return frames >= 3 ? ["existing", "voice-note"] : ["existing"];
      },
      nextFrame: driver.nextFrame,
    });
    driver.tick();
    driver.tick();
    await expect(pending).resolves.toBe(true);
    expect(driver.pending).toBe(0);
  });

  it("resolves false after maxFrames when no attachment ever appears", async () => {
    const driver = makeFrameDriver();
    let checks = 0;
    const pending = waitForVoiceAttachment(new Set(["existing"]), {
      observe: () => {
        checks += 1;
        return ["existing"];
      },
      nextFrame: driver.nextFrame,
      maxFrames: 5,
    });
    for (let i = 0; i < 4; i += 1) {
      driver.tick();
    }
    expect(driver.pending).toBe(0);
    await expect(pending).resolves.toBe(false);
    expect(checks).toBe(5);
  });

  it("defaults to 20 frames when maxFrames is omitted", async () => {
    const driver = makeFrameDriver();
    let checks = 0;
    const pending = waitForVoiceAttachment(new Set(), {
      observe: () => {
        checks += 1;
        return [];
      },
      nextFrame: driver.nextFrame,
    });
    for (let i = 0; i < 19; i += 1) {
      driver.tick();
    }
    await expect(pending).resolves.toBe(false);
    expect(checks).toBe(20);
  });

  it("ignores attachments that were already present before the stop", async () => {
    const driver = makeFrameDriver();
    const pending = waitForVoiceAttachment(new Set(["a", "b"]), {
      observe: () => ["a", "b"],
      nextFrame: driver.nextFrame,
      maxFrames: 2,
    });
    driver.tick();
    await expect(pending).resolves.toBe(false);
  });
});
