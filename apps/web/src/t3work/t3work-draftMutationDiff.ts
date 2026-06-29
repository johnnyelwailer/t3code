import type { T3WorkDraftRichContent } from "~/t3work/t3work-draftMutationTypes";

export type T3WorkDraftDiffRow = {
  readonly type: "unchanged" | "added" | "removed";
  readonly text: string;
};

function htmlToText(html: string): string {
  if (typeof window !== "undefined") {
    const parser = new DOMParser();
    return parser.parseFromString(html, "text/html").body.textContent ?? "";
  }
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ");
}

export function draftContentToComparableText(content?: T3WorkDraftRichContent): string {
  if (!content) return "";
  const body = content.body.trim();
  return content.format === "html" ? htmlToText(body).trim() : body;
}

function splitLines(value: string): string[] {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized.length > 0 ? normalized.split("\n") : [];
}

export function buildDraftTextDiff(input: {
  readonly current?: T3WorkDraftRichContent;
  readonly proposed: T3WorkDraftRichContent;
}): T3WorkDraftDiffRow[] {
  const currentLines = splitLines(draftContentToComparableText(input.current));
  const proposedLines = splitLines(draftContentToComparableText(input.proposed));
  const table = Array.from({ length: currentLines.length + 1 }, () =>
    Array<number>(proposedLines.length + 1).fill(0),
  );
  const score = (left: number, right: number) => table[left]?.[right] ?? 0;

  for (let left = currentLines.length - 1; left >= 0; left -= 1) {
    for (let right = proposedLines.length - 1; right >= 0; right -= 1) {
      const currentLine = currentLines[left] ?? "";
      const proposedLine = proposedLines[right] ?? "";
      table[left]![right] =
        currentLines[left] === proposedLines[right]
          ? score(left + 1, right + 1) + 1
          : Math.max(score(left + 1, right), score(left, right + 1));
      if (currentLine !== proposedLine) {
        table[left]![right] = Math.max(score(left + 1, right), score(left, right + 1));
      }
    }
  }

  const rows: T3WorkDraftDiffRow[] = [];
  let left = 0;
  let right = 0;
  while (left < currentLines.length && right < proposedLines.length) {
    const currentLine = currentLines[left] ?? "";
    const proposedLine = proposedLines[right] ?? "";
    if (currentLine === proposedLine) {
      rows.push({ type: "unchanged", text: currentLine });
      left += 1;
      right += 1;
    } else if (score(left + 1, right) >= score(left, right + 1)) {
      rows.push({ type: "removed", text: currentLine });
      left += 1;
    } else {
      rows.push({ type: "added", text: proposedLine });
      right += 1;
    }
  }

  for (; left < currentLines.length; left += 1) {
    rows.push({ type: "removed", text: currentLines[left] ?? "" });
  }
  for (; right < proposedLines.length; right += 1) {
    rows.push({ type: "added", text: proposedLines[right] ?? "" });
  }
  return rows;
}
