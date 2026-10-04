/**
 * ComposerVoiceInput - full voice input with live waveform, language switch, and auto-send.
 *
 * The implementation lives in @t3tools/shared (packages/shared/src/voiceInputUi.tsx)
 * so nexi-work and nexi-portal share ONE source of truth for the voice UI.
 * This file only keeps the app import path stable for ChatComposer.
 */
export { ComposerVoiceInput } from "@t3tools/shared/voiceInputUi";
