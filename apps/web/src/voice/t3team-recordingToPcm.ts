import { DESKTOP_VOICE_SAMPLE_RATE } from "@t3tools/contracts";

const BASE64_CHUNK_BYTES = 0x8000;

export function floatToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
}

/** Decodes a recorded blob URL and resamples it to the 16 kHz mono PCM whisper expects. */
export async function decodeRecordingToPcm16Base64(uri: string): Promise<string> {
  const encoded = await (await fetch(uri)).arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(encoded);
    const offline = new OfflineAudioContext(
      1,
      Math.max(1, Math.ceil(decoded.duration * DESKTOP_VOICE_SAMPLE_RATE)),
      DESKTOP_VOICE_SAMPLE_RATE,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return floatToPcm16Base64((await offline.startRendering()).getChannelData(0));
  } finally {
    void context.close();
  }
}
