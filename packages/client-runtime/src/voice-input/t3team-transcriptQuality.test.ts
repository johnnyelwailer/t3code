import { describe, expect, it } from "vite-plus/test";

import { sanitizeTranscript } from "./t3team-transcriptQuality.ts";

describe("sanitizeTranscript", () => {
  it.each([
    "Thank you.",
    "Thanks for watching!",
    "thank you for watching",
    "Untertitel der Amara.org-Community",
    "Vielen Dank fürs Zuschauen.",
    "Sous-titres réalisés par la communauté d'Amara.org",
    "you",
    "[BLANK_AUDIO]",
    "(silence)",
    "*music* ♪",
    ".",
    "a",
    "the the the the the the",
    "E aí",
    "E aí E aí E aí E aí E aí E aí E aí E aí E aí E aí",
    "ja genau ja genau ja genau",
    "Obrigado.",
  ])("drops %j", (hallucination) => {
    expect(sanitizeTranscript(hallucination)).toBe("");
  });

  it.each([
    "Open the voice thread and watch pull request 42.",
    "Thank you, now spawn a thread for the login bug.",
    "Starte einen neuen Thread für den Release.",
    "Nein, nein, das ist falsch.",
    "Mach das Board auf und dann das Board zu.",
  ])("keeps real speech %j", (speech) => {
    expect(sanitizeTranscript(speech)).toBe(speech);
  });

  it("strips non-speech markers around real speech", () => {
    expect(sanitizeTranscript("[Music] open the thread (applause)")).toBe("open the thread");
  });
});
