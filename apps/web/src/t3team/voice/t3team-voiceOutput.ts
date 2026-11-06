/**
 * The "reply / overlay" side of voice (spoken reply, barge-in, overlay). READS only — a read-only
 * view over the message / voice state, with no composer or timeline imports. TTS has no upstream
 * counterpart, so this side stays ours and hosts the read-only overlay helpers.
 */
export { voiceCompanionMood, voiceCompanionPreferences } from "./t3team-voiceCompanion";

/** One reply a voice-output consumer (TTS, barge-in, overlay) can act on, as plain data. */
export type VoiceOutputMessage = {
  readonly id: string;
  readonly role: "assistant" | "agent";
  readonly text: string;
  readonly isStreaming: boolean;
};

/**
 * A read-only view over the voice reply state. Consumers read it; none of them writes the composer.
 * Kept to reads so the boundary never depends on composer or timeline internals.
 */
export type VoiceOutputSource = {
  readonly latestReply: () => VoiceOutputMessage | null;
  readonly isResponding: () => boolean;
};

/**
 * Builds a read-only source from a plain, caller-supplied snapshot of messages. The caller hands in
 * data (never a composer or timeline handle), so the boundary stays on the read side of the seam.
 */
export function readOnlyVoiceOutputSource(
  readMessages: () => readonly VoiceOutputMessage[],
): VoiceOutputSource {
  const latest = (): VoiceOutputMessage | null => {
    const messages = readMessages();
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!message) continue;
      if (message.role === "assistant" || message.role === "agent") return message;
    }
    return null;
  };
  return {
    latestReply: latest,
    isResponding: () => latest()?.isStreaming === true,
  };
}
