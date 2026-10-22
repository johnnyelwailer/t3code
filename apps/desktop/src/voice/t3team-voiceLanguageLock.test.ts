import { describe, expect, it } from "vite-plus/test";

import {
  createLanguageLock,
  MIN_VOTE_AUDIO_MS,
  VOTE_DEADLINE_MS,
} from "./t3team-voiceLanguageLock.ts";

const ENOUGH = MIN_VOTE_AUDIO_MS + 1_000;
const locked = (language: string) => ({ kind: "locked", language });

describe("createLanguageLock", () => {
  it("pins a configured language from the start and never lets votes change it", () => {
    const lock = createLanguageLock("de");
    expect(lock.pinned).toBe(true);
    expect(lock.current()).toBe("de");
    expect(lock.vote("nl", ENOUGH)).toEqual({ kind: "pending" });
    expect(lock.vote("nl", VOTE_DEADLINE_MS + 1_000)).toEqual({ kind: "pending" });
    expect(lock.current()).toBe("de");
  });

  it("treats auto in any spelling as no pin, and a pin in any case as the same pin", () => {
    expect(createLanguageLock("auto").pinned).toBe(false);
    expect(createLanguageLock("  Auto ").pinned).toBe(false);
    expect(createLanguageLock("DE").current()).toBe("de");
  });

  it("collects no vote from a partial that covered too little speech", () => {
    const lock = createLanguageLock("auto");
    expect(lock.vote("nl", MIN_VOTE_AUDIO_MS - 1)).toEqual({ kind: "pending" });
    expect(lock.vote("nl", MIN_VOTE_AUDIO_MS - 1)).toEqual({ kind: "pending" });
    expect(lock.vote("nl", MIN_VOTE_AUDIO_MS - 1)).toEqual({ kind: "pending" });
    expect(lock.current()).toBe("auto");
  });

  it("locks the first language two sufficiently long partials agree on", () => {
    const lock = createLanguageLock("auto");
    expect(lock.vote("de", ENOUGH)).toEqual({ kind: "pending" });
    expect(lock.current()).toBe("auto");
    expect(lock.vote("de", ENOUGH + 2_000)).toEqual(locked("de"));
    expect(lock.current()).toBe("de");
    expect(lock.vote("en", ENOUGH + 4_000)).toEqual({ kind: "pending" });
    expect(lock.current()).toBe("de");
  });

  it("keeps collecting while votes disagree and locks once one language leads", () => {
    const lock = createLanguageLock("auto");
    expect(lock.vote("nl", ENOUGH)).toEqual({ kind: "pending" });
    expect(lock.vote("de", ENOUGH + 1_000)).toEqual({ kind: "pending" });
    expect(lock.current()).toBe("auto");
    expect(lock.vote("de", ENOUGH + 2_000)).toEqual(locked("de"));
  });

  it("ignores votes without a language and normalizes the ones it gets", () => {
    const lock = createLanguageLock("auto");
    lock.vote(undefined, ENOUGH);
    lock.vote("", ENOUGH);
    expect(lock.vote(" DE ", ENOUGH)).toEqual({ kind: "pending" });
    expect(lock.vote("de", ENOUGH)).toEqual(locked("de"));
  });

  it("stays on auto-detection when the votes tie at the deadline", () => {
    const lock = createLanguageLock("auto");
    expect(lock.vote("nl", ENOUGH)).toEqual({ kind: "pending" });
    expect(lock.vote("de", VOTE_DEADLINE_MS)).toEqual({ kind: "kept-auto" });
    expect(lock.current()).toBe("auto");
    expect(lock.vote("de", VOTE_DEADLINE_MS + 2_000)).toEqual({ kind: "pending" });
    expect(lock.current()).toBe("auto");
  });

  it("does not lock on a single vote even at the deadline", () => {
    const lock = createLanguageLock("auto");
    expect(lock.vote("nl", VOTE_DEADLINE_MS)).toEqual({ kind: "kept-auto" });
    expect(lock.locked()).toBeNull();
  });

  it("locks the language that leads when the deciding vote arrives at the deadline", () => {
    const lock = createLanguageLock("auto");
    lock.vote("de", ENOUGH);
    lock.vote("nl", ENOUGH + 1_000);
    expect(lock.vote("de", VOTE_DEADLINE_MS)).toEqual(locked("de"));
  });

  it("starts every recording undecided, whatever the previous one settled on", () => {
    const first = createLanguageLock("auto");
    first.vote("nl", ENOUGH);
    first.vote("nl", ENOUGH + 2_000);
    expect(first.current()).toBe("nl");

    const second = createLanguageLock("auto");
    expect(second.current()).toBe("auto");
    second.vote("en", ENOUGH);
    expect(second.vote("en", ENOUGH + 2_000)).toEqual(locked("en"));
  });
});
