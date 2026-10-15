import type { TranscriptionEvent, TranscriptionProbe } from "./t3team-transcriptionProtocol.ts";

/**
 * A pluggable speech-to-text engine. The built-in engines are the OS-native helpers
 * (macOS Speech, Windows speech); custom engines (e.g. a local Whisper wrapper) can be added
 * through `<userData>/t3team-transcription.json` (see t3team-transcriptionConfig.ts) or by code via
 * `TranscriptionRegistry.register`.
 */
export interface TranscriptionEngine {
  readonly id: string;
  readonly label: string;
  readonly kind: "native" | "custom";
  /** Capability detection; must not prompt for permissions. */
  probe(locale?: string): Promise<TranscriptionProbe>;
  start(options: TranscriptionStartOptions): TranscriptionSession;
}

export interface TranscriptionStartOptions {
  /** BCP-47 locale, e.g. "de-CH". */
  readonly locale: string;
  readonly onEvent: (event: TranscriptionEvent) => void;
}

export interface TranscriptionSession {
  /** Finish gracefully: stop listening, flush the last final, then emit `end`. */
  stop(): void;
  /** Drop everything immediately (no further events except `end`). */
  abort(): void;
}
