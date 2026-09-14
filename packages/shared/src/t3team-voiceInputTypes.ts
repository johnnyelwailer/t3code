/**
 * Public types for the framework-agnostic voice input controller
 * (t3team-voiceInput.ts): state machine types, callbacks, options and the
 * loosely-typed browser SpeechRecognition globals.
 * Split out of t3team-voiceInput.ts so each file stays under the additive
 * guard's 200 non-empty line ceiling.
 */

export type VoiceInputState = "idle" | "recording" | "processing" | "error" | "unsupported";

export interface VoiceInputError {
  code: string;
  message: string;
}

export interface VoiceInputCallbacks {
  onStateChange?: (state: VoiceInputState) => void;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: VoiceInputError) => void;
}

export interface VoiceInputOptions {
  /** Language for recognition, e.g. "en-US". Defaults to browser locale. */
  lang?: string;
  /** If true, recognition stops after one utterance. Default false. */
  singleUtterance?: boolean;
}

// ---------------------------------------------------------------------------
// Browser globals (typed loosely to avoid needing a DOM lib in shared)
// ---------------------------------------------------------------------------

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
export interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}
export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    [index: number]: SpeechRecognitionResult;
    length: number;
  };
}
export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
