const TARGET_RATE = 16_000;

type WavPcm = { readonly sampleRate: number; readonly samples: Float32Array };

function readChunks(wav: Buffer): Map<string, Buffer> {
  const chunks = new Map<string, Buffer>();
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    chunks.set(id, wav.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size + (size % 2);
  }
  return chunks;
}

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_MULAW = 7;

/** G.711 mu-law byte to a linear 16-bit sample. */
function decodeMuLaw(byte: number): number {
  const inverted = ~byte & 0xff;
  const magnitude = (((inverted & 0x0f) << 3) + 0x84) << ((inverted & 0x70) >> 4);
  return inverted & 0x80 ? 0x84 - magnitude : magnitude - 0x84;
}

/** Reads a 16-bit PCM or 8-bit mu-law WAV (the minds14 clips) and downmixes it to mono floats. */
export function decodeWav(wav: Buffer): WavPcm {
  const chunks = readChunks(wav);
  const format = chunks.get("fmt ");
  const data = chunks.get("data");
  if (!format || !data) throw new Error("WAV clip has no fmt or data chunk.");
  const tag = format.readUInt16LE(0);
  const bits = format.readUInt16LE(14);
  const isPcm16 = tag === WAVE_FORMAT_PCM && bits === 16;
  const isMuLaw = tag === WAVE_FORMAT_MULAW && bits === 8;
  if (!isPcm16 && !isMuLaw) {
    throw new Error(`Unsupported WAV encoding (format ${tag}, ${bits} bit) in the eval harness.`);
  }
  const channels = format.readUInt16LE(2);
  const bytesPerSample = bits / 8;
  const frames = Math.floor(data.length / (bytesPerSample * channels));
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const offset = (frame * channels + channel) * bytesPerSample;
      sum += isMuLaw ? decodeMuLaw(data.readUInt8(offset)) : data.readInt16LE(offset);
    }
    samples[frame] = sum / channels / 0x8000;
  }
  return { sampleRate: format.readUInt32LE(4), samples };
}

export function resampleLinear(input: WavPcm, targetRate: number): Float32Array {
  if (input.sampleRate === targetRate) return input.samples;
  const length = Math.floor((input.samples.length * targetRate) / input.sampleRate);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = (index * input.sampleRate) / targetRate;
    const left = Math.floor(position);
    const fraction = position - left;
    output[index] =
      (input.samples[left] ?? 0) * (1 - fraction) +
      (input.samples[Math.min(left + 1, input.samples.length - 1)] ?? 0) * fraction;
  }
  return output;
}

export function wavToPcm16Base64(wav: Buffer): string {
  const samples = resampleLinear(decodeWav(wav), TARGET_RATE);
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm.writeInt16LE(Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff), index * 2);
  });
  return pcm.toString("base64");
}
