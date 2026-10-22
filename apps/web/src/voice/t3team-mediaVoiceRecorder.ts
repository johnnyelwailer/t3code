// @effect-diagnostics globalTimers:off -- Recording limit runs at a MediaRecorder callback boundary.
import type { VoiceRecorder } from "@t3tools/client-runtime/voice-input";

import type { VoicePcmTap } from "./t3team-voicePcmTap";

/**
 * Chromium's WebRTC capture processing: noise suppression and echo cancellation (so the speakers'
 * own audio is not dictated), mono, but no gain control, unlike `audio: true` (the Activity
 * Tracker's). Measured on Phil's mic, AGC lifted voices across the room from 0.02-0.05 to 0.07-0.25,
 * as loud as the speaker, which erases the level that tells the speaker apart (near-field gate).
 */
const DICTATION_AUDIO: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false,
};

/** Browser recorder behind the client-runtime `VoiceRecorder` seam; `uri` is a blob URL after stop. */
export class MediaVoiceRecorder implements VoiceRecorder {
  uri: string | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private limitTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * `onLimitReached` receives the finished recording when `forDuration` elapses on its own. The
   * optional `tap` streams the same microphone to live transcription while it records.
   */
  constructor(
    private readonly onLimitReached: (uri: string) => void,
    private readonly tap?: VoicePcmTap,
  ) {}

  async prepareToRecordAsync(): Promise<void> {
    this.uri = null;
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: DICTATION_AUDIO });
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (event) => this.chunks.push(event.data);
    try {
      await this.tap?.start(this.stream);
    } catch (error) {
      this.releaseStream();
      throw error;
    }
  }

  record(options: { readonly forDuration: number }): void {
    this.recorder?.start();
    this.limitTimer = setTimeout(() => {
      void this.stop().then(() => {
        if (this.uri) this.onLimitReached(this.uri);
      });
    }, options.forDuration * 1000);
  }

  stop(): Promise<void> {
    clearTimeout(this.limitTimer);
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") {
      this.releaseStream();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        this.uri = URL.createObjectURL(new Blob(this.chunks, { type: recorder.mimeType }));
        this.releaseStream();
        resolve();
      };
      recorder.stop();
    });
  }

  private releaseStream(): void {
    this.tap?.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

export async function requestMicrophonePermission(): Promise<{
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}> {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((track) => track.stop());
    return { granted: true, canAskAgain: true };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}
