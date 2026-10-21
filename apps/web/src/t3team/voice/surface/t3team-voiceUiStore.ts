import { create } from "zustand";

import {
  IDLE_VOICE_UI,
  reduceVoiceUi,
  type VoiceUiAction,
  type VoiceUiSnapshot,
} from "./t3team-voiceUiModel";

/** What the surfaces can ask of whichever window owns the recording. */
export interface VoiceUiControls {
  /** Start when idle or failed, stop when recording. */
  readonly toggle: () => void;
  /** Clear a failure or a blocked-microphone notice without recording. */
  readonly dismiss: () => void;
  readonly openMicrophoneSettings: (() => void) | null;
}

export interface VoiceUiLive {
  /** 0-1 input loudness of the latest chunk. */
  readonly level: number;
  /** Transcript of the utterance so far. */
  readonly partial: string;
}

export interface VoiceUiStore {
  readonly snapshot: VoiceUiSnapshot;
  readonly live: VoiceUiLive;
  readonly controls: VoiceUiControls | null;
  readonly setSnapshot: (snapshot: VoiceUiSnapshot) => void;
  readonly dispatch: (action: VoiceUiAction) => void;
  readonly setLive: (live: Partial<VoiceUiLive>) => void;
  readonly setControls: (controls: VoiceUiControls | null) => void;
}

export const IDLE_VOICE_LIVE: VoiceUiLive = { level: 0, partial: "" };

/**
 * The voice session's shared view: the main window's recorder publishes into it, and the thread
 * row, the in-thread surface and the floating widget read from it. The floating widget window has
 * a store of its own, fed from the main window over IPC.
 */
export const useVoiceUiStore = create<VoiceUiStore>()((set) => ({
  snapshot: IDLE_VOICE_UI,
  live: IDLE_VOICE_LIVE,
  controls: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  dispatch: (action) => set((state) => ({ snapshot: reduceVoiceUi(state.snapshot, action) })),
  setLive: (live) => set((state) => ({ live: { ...state.live, ...live } })),
  setControls: (controls) => set({ controls }),
}));

export const readVoiceLevel = (): number => useVoiceUiStore.getState().live.level;

export const dispatchVoiceUi = (action: VoiceUiAction): void =>
  useVoiceUiStore.getState().dispatch(action);
