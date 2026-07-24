/**
 * Sanctioned icon set for widget authors.
 *
 * The widget authoring guidance requires "accessible inline SVG icons using currentColor and
 * consistent 16px or 20px sizing", forbids emoji/Unicode pictograms, and forbids depending on an
 * external icon library — and the widget CSP blocks every external request anyway. That left
 * authors hand-writing path data, which is exactly how ✅/⚠️/⛔ creeps back in.
 *
 * The host therefore injects this sprite into every widget's srcdoc. Authors reference it:
 *
 *   <svg class="t3w-icon" aria-hidden="true"><use href="#t3w-icon-check" /></svg>
 *   <svg class="t3w-icon t3w-icon-lg"><use href="#t3w-icon-triangle-alert" /></svg>
 *
 * `.t3w-icon` is 16px, `.t3w-icon-lg` 20px, both `currentColor` — so an icon inherits whatever
 * theme token colours its surrounding text, in light and dark alike. Because the host injects it,
 * the sprite costs the author nothing against the 128 KB `widget_code` cap.
 *
 * Geometry is the Lucide 24×24 grid (lucide-react, ISC — portions from Feather, MIT), the same
 * set the host app's own React UI uses, so a widget icon and a shell icon are the same drawing.
 */

/** Icon name -> inner SVG markup on the shared 24x24 grid. */
const ICON_NODES: Readonly<Record<string, string>> = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  "circle-check": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  "circle-x": '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  "circle-alert": '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  "circle-dot": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  "triangle-alert":
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  ban: '<path d="M4.929 4.929 19.07 19.071"/><circle cx="12" cy="12" r="10"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  clock: '<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/>',
  calendar:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  "loader-circle": '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "external-link":
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  "trending-up": '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  "trending-down": '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  "file-text":
    '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  "git-pull-request":
    '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  sparkles:
    '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
};

/** The allowlist widget authors may reference. Stable ids — renaming one breaks saved widgets. */
export const T3WORK_WIDGET_ICON_NAMES: ReadonlyArray<string> = Object.keys(ICON_NODES).toSorted();

/** `<use href="#…">` target for an icon name. */
export function t3workWidgetIconId(name: string): string {
  return `t3w-icon-${name}`;
}

/** CSS the srcdoc reset ships so `.t3w-icon` sizes and colours itself from its text context. */
export const T3WORK_WIDGET_ICON_CSS = [
  ".t3w-icon { width: 16px; height: 16px; flex: none; display: inline-block;",
  "vertical-align: text-bottom; color: currentColor; }",
  ".t3w-icon-lg { width: 20px; height: 20px; }",
].join(" ");

/**
 * The hidden `<svg>` holding one `<symbol>` per icon. Stroke presentation lives on the symbol so
 * an author only writes `<use>`; `currentColor` keeps it theme-correct in light and dark.
 */
export function buildT3workWidgetIconSprite(): string {
  const symbols = Object.entries(ICON_NODES)
    .map(
      ([name, nodes]) =>
        `<symbol id="${t3workWidgetIconId(name)}" viewBox="0 0 24 24" fill="none" ` +
        `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
        `stroke-linejoin="round">${nodes}</symbol>`,
    )
    .join("");
  return `<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbols}</svg>`;
}
