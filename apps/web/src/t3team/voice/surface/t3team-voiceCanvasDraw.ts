import { rgba, type VoiceCanvasPalette } from "./t3team-voiceCanvasPalette";
import type { VoiceLevelHistory } from "./t3team-voiceLevelHistory";

export interface VoiceCanvasFrame {
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly palette: VoiceCanvasPalette;
  readonly history: VoiceLevelHistory;
  readonly seconds: number;
}

/** Fits the canvas bitmap to its CSS box at device resolution; returns a ready frame or null while it has no size. */
export function beginFrame(
  canvas: HTMLCanvasElement,
  resolvePalette: () => VoiceCanvasPalette,
  history: VoiceLevelHistory,
  seconds: number,
): VoiceCanvasFrame | null {
  const box = canvas.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return null;
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(box.width * ratio);
  const pixelHeight = Math.round(box.height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (context === null) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, box.width, box.height);
  return {
    context,
    width: box.width,
    height: box.height,
    palette: resolvePalette(),
    history,
    seconds,
  };
}

const RIBBON_LAYERS = [
  { gain: 1, frequency: 3.2, drift: 1.7, alpha: 0.95, line: 1.6, glow: true },
  { gain: 0.66, frequency: 5.1, drift: -1.15, alpha: 0.42, line: 1.25, glow: false },
  { gain: 0.42, frequency: 7.6, drift: 2.4, alpha: 0.22, line: 1, glow: false },
] as const;

/** Three layered sine ribbons whose envelope follows the recent input level, loudest in the middle. */
export function drawRibbon(frame: VoiceCanvasFrame): void {
  const { context: g, width, height, palette, history, seconds } = frame;
  const middle = height / 2;
  g.strokeStyle = rgba(palette.foreground, 0.08);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, middle);
  g.lineTo(width, middle);
  g.stroke();
  for (const layer of RIBBON_LAYERS) {
    g.beginPath();
    for (let x = 0; x <= width; x += 2) {
      const u = x / width;
      const envelope = Math.sin(u * Math.PI) ** 1.15;
      const loudness = history.at(1 - Math.abs(u - 0.5) * 2) ** 0.85;
      const sway = 0.72 + 0.28 * Math.sin(u * 9 + seconds * 0.9 + layer.frequency);
      const amplitude = (0.08 + 0.92 * loudness) * height * 0.44 * layer.gain * envelope * sway;
      const y =
        middle +
        amplitude * Math.sin(u * Math.PI * 2 * layer.frequency + seconds * layer.drift * Math.PI);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = rgba(palette.primary, layer.alpha);
    g.lineWidth = layer.line;
    g.shadowBlur = layer.glow ? 10 : 0;
    g.shadowColor = rgba(palette.primary, 0.5);
    g.stroke();
  }
  g.shadowBlur = 0;
}

const BAR_WIDTH = 2;
const BAR_GAP = 2;

/** Small rounded bars scrolling the recent level, fading in toward the newest. */
export function drawBars(frame: VoiceCanvasFrame): void {
  const { context: g, width, height, palette, history } = frame;
  const count = Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP));
  const middle = height / 2;
  for (let index = 0; index < count; index++) {
    const u = count > 1 ? index / (count - 1) : 1;
    const barHeight = Math.max(2, history.at(u) ** 0.8 * (height - 2));
    g.fillStyle = rgba(palette.primary, 0.28 + 0.72 * u);
    g.beginPath();
    g.roundRect(index * (BAR_WIDTH + BAR_GAP), middle - barHeight / 2, BAR_WIDTH, barHeight, 1);
    g.fill();
  }
}
