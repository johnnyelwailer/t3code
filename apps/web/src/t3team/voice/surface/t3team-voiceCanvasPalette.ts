export type Rgb = readonly [number, number, number];

export interface VoiceCanvasPalette {
  readonly primary: Rgb;
  readonly foreground: Rgb;
}

let colorProbe: CanvasRenderingContext2D | null = null;

function probeContext(): CanvasRenderingContext2D | null {
  if (colorProbe === null) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorProbe = canvas.getContext("2d", { willReadFrequently: true });
  }
  return colorProbe;
}

/** A theme custom property as RGB, resolved the way the page paints it (oklch, color-mix and all). */
function resolveRgb(host: Element, property: string): Rgb {
  const context = probeContext();
  const probe = host.ownerDocument.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  probe.style.color = `var(${property})`;
  host.append(probe);
  const painted = getComputedStyle(probe).color;
  probe.remove();
  if (context === null) return [128, 128, 128];
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = painted;
  context.fillRect(0, 0, 1, 1);
  const [red = 128, green = 128, blue = 128] = context.getImageData(0, 0, 1, 1).data;
  return [red, green, blue];
}

const themeKey = (root: HTMLElement) =>
  `${root.className}|${root.dataset.theme ?? ""}|${root.dataset.themeId ?? ""}`;

let cache: { readonly key: string; readonly palette: VoiceCanvasPalette } | null = null;

/** Palette of the active theme; recomputed only when the theme classes on the root change. */
export function resolveVoicePalette(host: Element): VoiceCanvasPalette {
  const root = host.ownerDocument.documentElement;
  const key = themeKey(root);
  if (cache?.key === key) return cache.palette;
  const palette = {
    primary: resolveRgb(host, "--primary"),
    foreground: resolveRgb(host, "--foreground"),
  };
  cache = { key, palette };
  return palette;
}

export const rgba = ([red, green, blue]: Rgb, alpha: number) =>
  `rgba(${red},${green},${blue},${alpha})`;
