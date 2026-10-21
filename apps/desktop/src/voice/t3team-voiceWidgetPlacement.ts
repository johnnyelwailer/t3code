import { VOICE_WIDGET_ROUTE_PATH } from "@t3tools/contracts";

export const VOICE_WIDGET_SIZE = { width: 440, height: 340 } as const;
export const VOICE_WIDGET_MARGIN = 16;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The widget sits in the bottom-right corner of the work area, clear of the taskbar. */
export function voiceWidgetBounds(workArea: Rect): Rect {
  const { width, height } = VOICE_WIDGET_SIZE;
  return {
    x: workArea.x + workArea.width - width - VOICE_WIDGET_MARGIN,
    y: workArea.y + workArea.height - height - VOICE_WIDGET_MARGIN,
    width,
    height,
  };
}

/** The desktop renderer routes by hash, so the widget route goes after `#`. */
export function voiceWidgetUrl(applicationUrl: string): string {
  return new URL(`/#${VOICE_WIDGET_ROUTE_PATH}`, applicationUrl).href;
}
