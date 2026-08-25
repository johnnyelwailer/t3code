/**
 * Shared types and tuning constants for the voice input UI.
 *
 * The language list is configurable at the app level (see
 * ComposerVoiceInput's `languages` / `initialLanguage` props); these
 * defaults reproduce the shipped UX. UI copy is German.
 */

/** Composer-level state machine. */
export type VoiceState = "idle" | "waiting" | "recording" | "denied";

/** How the recording stops: manual tap, or automatically after a pause. */
export type StopMode = "manual" | "auto";

/** One selectable recognition language (code + short display label). */
export interface VoiceLanguageOption {
  code: string;
  label: string;
}

/** Default language chips (the shipped UX). */
export const DEFAULT_VOICE_LANGUAGES: readonly VoiceLanguageOption[] = [
  { code: "de-CH", label: "DE" },
  { code: "fr-CH", label: "FR" },
  { code: "en-US", label: "EN" },
];

/** Recognition language used when the app does not override it. */
export const DEFAULT_LANGUAGE_CODE = "en-US";

/**
 * Stop-mode entries, in display order.
 * Extensible: a live-voice-assistant mode will join this list later.
 */
export const STOP_MODES: readonly { mode: StopMode; label: string }[] = [
  { mode: "manual", label: "Manuell stoppen" },
  { mode: "auto", label: "Automatisch senden" },
];

// -- waveform tuning ---------------------------------------------------------

/** Number of waveform bars rendered inside the recording pill. */
export const BAR_COUNT = 6;

// -- auto-send tuning --------------------------------------------------------

/** Average level below which the stream counts as silence. */
export const SILENCE_ENERGY_THRESHOLD = 0.2;
/** Silence duration that triggers auto-send. */
export const AUTO_SEND_PAUSE_MS: Record<Extract<StopMode, "auto">, number> = {
  auto: 3000,
};

// -- recognition tuning ------------------------------------------------------

/** Delay between aborting and restarting recognition on a language switch. */
export const LANGUAGE_SWITCH_DELAY_MS = 150;
