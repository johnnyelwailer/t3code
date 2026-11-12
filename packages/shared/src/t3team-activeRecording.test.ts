import { describe, expect, it } from "vite-plus/test";

import { claimActiveRecording } from "./t3team-activeRecording.ts";

function recorder(name: string, log: string[]) {
  const release: { current: () => void } = { current: () => {} };
  const stop = () => {
    log.push(`stop ${name}`);
    release.current();
  };
  return { release, stop };
}

describe("claimActiveRecording", () => {
  it("stops the current recording when a second one starts, never leaving two live", () => {
    const log: string[] = [];
    const first = recorder("first", log);
    const second = recorder("second", log);

    first.release.current = claimActiveRecording(first.stop);
    second.release.current = claimActiveRecording(second.stop);

    expect(log).toEqual(["stop first"]);
  });

  it("lets a released recording be followed by a new one without stopping anything", () => {
    const log: string[] = [];
    const first = recorder("first", log);
    first.release.current = claimActiveRecording(first.stop);
    first.release.current();

    const second = recorder("second", log);
    second.release.current = claimActiveRecording(second.stop);

    expect(log).toEqual([]);
    second.release.current();
  });

  it("a stale release cannot free a newer holder's slot", () => {
    const log: string[] = [];
    const first = recorder("first", log);
    const second = recorder("second", log);
    const releaseFirst = claimActiveRecording(first.stop);
    second.release.current = claimActiveRecording(second.stop);
    releaseFirst();

    const third = recorder("third", log);
    third.release.current = claimActiveRecording(third.stop);

    expect(log).toContain("stop second");
    third.release.current();
  });
});
