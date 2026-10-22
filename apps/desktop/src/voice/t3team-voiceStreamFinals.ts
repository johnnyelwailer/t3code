import { createLanguageLock } from "./t3team-voiceLanguageLock.ts";
import type { createPassChain } from "./t3team-voicePassChain.ts";
import { pcm16ToBase64, samplesToMs } from "./t3team-voicePcm.ts";
import type {
  VoiceStreamEmit,
  VoiceStreamTranscribe,
  VoiceStreamTranscription,
} from "./t3team-voiceStreamSession.ts";

/**
 * The final passes of one recording session: each committed utterance's audio is written down on
 * the shared pass chain with the session's language, votes for that language, and goes out as an
 * `utterance` (or `utterance-failed`) event. `settled` resolves once every event so far was sent.
 */
export function createStreamFinals(input: {
  readonly passes: ReturnType<typeof createPassChain>;
  readonly language: ReturnType<typeof createLanguageLock>;
  readonly transcribe: VoiceStreamTranscribe;
  readonly emit: VoiceStreamEmit;
  readonly log: (message: string) => void;
  readonly isStopped: () => boolean;
}) {
  const { passes, language, emit, log } = input;
  let committed = 0;
  let events: Promise<unknown> = Promise.resolve();

  function voteLanguage(result: VoiceStreamTranscription, windowMs: number) {
    if (!result.ok || result.text.trim() === "") return;
    const outcome = language.vote(result.language, windowMs);
    if (!language.pinned) {
      log(
        `stream language vote: ${result.language ?? "none"} from ${Math.round(windowMs)} ms of speech -> ${outcome.kind}`,
      );
    }
    if (outcome.kind === "locked") {
      log(`stream language locked: ${outcome.language}`);
      emit({ type: "language", language: outcome.language });
    }
  }

  /** One pass over `pcm`, queued behind whatever the worker is doing. */
  function writeDown(pcm: Int16Array): Promise<VoiceStreamTranscription> {
    const pass = passes.run(() =>
      input.transcribe({ pcm16Base64: pcm16ToBase64(pcm), language: language.current() }),
    );
    return pass.then((result) => {
      log(
        result.ok
          ? `stream final: ${result.elapsedMs} ms to transcribe ${Math.round(samplesToMs(pcm.length))} ms of audio`
          : `stream final failed: ${result.message}`,
      );
      voteLanguage(result, samplesToMs(pcm.length));
      return result;
    });
  }

  return {
    voteLanguage,
    writeDown,
    get committed(): number {
      return committed;
    },
    /** Writes `pcm` down in the background and reports it as an utterance. */
    commit(pcm: Int16Array): void {
      committed += 1;
      const sent = writeDown(pcm)
        .then((result) => {
          if (input.isStopped()) return;
          if (result.ok)
            emit({ type: "utterance", text: result.text, elapsedMs: result.elapsedMs });
          else emit({ type: "utterance-failed", message: result.message });
        })
        .catch((error: unknown) => {
          if (!input.isStopped()) emit({ type: "utterance-failed", message: String(error) });
        });
      events = Promise.all([events, sent]);
    },
    settled: (): Promise<unknown> => events,
  };
}
