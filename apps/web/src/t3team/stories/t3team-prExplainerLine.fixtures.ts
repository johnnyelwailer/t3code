import type { T3TeamPrExplainerAnnotation, T3TeamPrExplainerDiffLine } from "@t3tools/contracts";

/**
 * Line builders for the PR explainer fixtures: write the code once and name the changed words,
 * and the character ranges come out right.
 */
function ranges(content: string, words: ReadonlyArray<string>) {
  return words.flatMap((word) => {
    const start = content.indexOf(word);
    return start < 0 ? [] : [{ start, end: start + word.length }];
  });
}

interface LineOptions {
  readonly mark?: ReadonlyArray<string>;
  readonly warn?: string;
  readonly info?: string;
}

function annotation(options: LineOptions): T3TeamPrExplainerAnnotation | undefined {
  if (options.warn) return { tone: "warning", text: options.warn };
  if (options.info) return { tone: "info", text: options.info };
  return undefined;
}

function line(
  kind: T3TeamPrExplainerDiffLine["kind"],
  oldLine: number | null,
  newLine: number | null,
  content: string,
  options: LineOptions = {},
): T3TeamPrExplainerDiffLine {
  const note = annotation(options);
  return {
    kind,
    oldLine,
    newLine,
    content,
    ...(options.mark ? { highlights: ranges(content, options.mark) } : {}),
    ...(note ? { annotation: note } : {}),
  };
}

export const ctx = (oldLine: number, newLine: number, content: string, options?: LineOptions) =>
  line("context", oldLine, newLine, content, options);
export const add = (newLine: number, content: string, options?: LineOptions) =>
  line("add", null, newLine, content, options);
export const del = (oldLine: number, content: string, options?: LineOptions) =>
  line("delete", oldLine, null, content, options);

/** A soft placeholder "screenshot" as an SVG data URI, so fixtures ship no binary assets. */
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
