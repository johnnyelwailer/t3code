import { describe, expect, it } from "vite-plus/test";

import { createLanguageLock } from "./t3team-voiceLanguageLock.ts";

describe("createLanguageLock", () => {
  it("starts locked on a configured language and ignores votes", () => {
    const lock = createLanguageLock("de");
    expect(lock.current()).toBe("de");
    expect(lock.vote("en")).toBeNull();
    expect(lock.vote("en")).toBeNull();
    expect(lock.current()).toBe("de");
  });

  it("stays on auto until enough transcripts voted, then locks the majority", () => {
    const lock = createLanguageLock("auto");
    expect(lock.current()).toBe("auto");
    expect(lock.vote("de")).toBeNull();
    expect(lock.current()).toBe("auto");
    expect(lock.vote("de")).toBe("de");
    expect(lock.current()).toBe("de");
    expect(lock.vote("en")).toBeNull();
    expect(lock.current()).toBe("de");
  });

  it("ignores transcripts that carried no language", () => {
    const lock = createLanguageLock("auto");
    lock.vote(undefined);
    lock.vote("");
    expect(lock.vote("en")).toBeNull();
    expect(lock.locked()).toBeNull();
  });

  it("breaks a tie toward the first language heard", () => {
    const lock = createLanguageLock("auto");
    lock.vote("en");
    expect(lock.vote("de")).toBe("en");
  });
});
