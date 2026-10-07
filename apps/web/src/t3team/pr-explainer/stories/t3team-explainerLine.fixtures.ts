import type { T3TeamExplainerAnnotation, T3TeamExplainerDiffLine } from "../model/t3team-explainer";

/**
 * Line builders for the explainer fixtures, shaped the way a model writes them: the code, the
 * changed words by name, and an optional note. Line numbers come from the block's start line.
 */
interface LineOptions {
  readonly mark?: ReadonlyArray<string>;
  readonly warn?: string;
  readonly info?: string;
}

function annotation(options: LineOptions): T3TeamExplainerAnnotation | undefined {
  if (options.warn) return { tone: "warning", text: options.warn };
  if (options.info) return { tone: "info", text: options.info };
  return undefined;
}

function line(
  kind: T3TeamExplainerDiffLine["kind"],
  content: string,
  options: LineOptions = {},
): T3TeamExplainerDiffLine {
  const note = annotation(options);
  return {
    kind,
    content,
    ...(options.mark ? { highlight: options.mark } : {}),
    ...(note ? { annotation: note } : {}),
  };
}

export const ctx = (content: string, options?: LineOptions) => line("context", content, options);
export const add = (content: string, options?: LineOptions) => line("add", content, options);
export const del = (content: string, options?: LineOptions) => line("delete", content, options);

/**
 * A soft placeholder "screenshot" as an SVG data URI. SVG is not an allowed explainer source, so
 * fixtures name it as an attachment and the story host resolves it — as a real host would.
 */
export function mockScreenshot(input: {
  readonly title: string;
  readonly rows: ReadonlyArray<{ readonly label: string; readonly chip?: string }>;
  readonly accent: string;
  readonly spinner?: boolean;
}) {
  const rows = input.rows
    .map((row, index) => {
      const y = 70 + index * 46;
      const chip = row.chip
        ? `<rect x="250" y="${y + 9}" width="86" height="20" rx="10" fill="${input.accent}" opacity="0.18"/><text x="293" y="${y + 23}" font-size="11" text-anchor="middle" fill="${input.accent}">${row.chip}</text>`
        : `<rect x="250" y="${y + 13}" width="86" height="12" rx="6" fill="#d4d4d8"/>`;
      return `<rect x="16" y="${y}" width="328" height="38" rx="8" fill="#ffffff" stroke="#e4e4e7"/><text x="30" y="${y + 23}" font-size="12" fill="#27272a">${row.label}</text>${chip}`;
    })
    .join("");
  const spinner = input.spinner
    ? `<circle cx="330" cy="32" r="7" fill="none" stroke="${input.accent}" stroke-width="2.5" stroke-dasharray="30 14"/>`
    : "";
  const height = 86 + input.rows.length * 46;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="${height}" viewBox="0 0 360 ${height}" font-family="ui-sans-serif,system-ui"><rect width="360" height="${height}" fill="#f4f4f5"/><rect x="0" y="0" width="360" height="54" fill="#ffffff"/><text x="16" y="36" font-size="15" font-weight="600" fill="#18181b">${input.title}</text>${spinner}${rows}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
