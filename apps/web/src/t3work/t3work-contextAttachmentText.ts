import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";

const ADDED_CONTEXT_HEADING = "### Added Context:";
const ADDED_CONTEXT_FOOTER = "Use the referenced workspace files for full context details.";

function inferKindFromType(typeValue: string | undefined): string {
  const value = (typeValue ?? "").toLowerCase();
  if (value.includes("jira") || value.includes("ticket")) {
    return "jira-work-item";
  }
  if (value.includes("github")) {
    return "github-activity";
  }
  return "context";
}

function normalizeKind(kindValue: string | undefined): string | undefined {
  const value = (kindValue ?? "").trim().toLowerCase();
  if (!value) return undefined;
  if (value.startsWith("jira-") || value.startsWith("github-") || value === "context") {
    return value;
  }
  return undefined;
}

function normalizeVisibleText(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

type ParsedContextBlock = {
  start: number;
  end: number;
  attachment: T3WorkContextAttachment;
};

function parseContextBlock(text: string, start: number, index: number): ParsedContextBlock | null {
  const headingStart = text.indexOf(ADDED_CONTEXT_HEADING, start);
  if (headingStart < 0) {
    return null;
  }
  const headingLineEnd = text.indexOf("\n", headingStart);
  if (headingLineEnd < 0) {
    return null;
  }
  const label = text.slice(headingStart + ADDED_CONTEXT_HEADING.length, headingLineEnd).trim();
  if (label.length === 0) {
    return null;
  }

  const footerIndex = text.indexOf(ADDED_CONTEXT_FOOTER, headingLineEnd + 1);
  if (footerIndex < 0) {
    return null;
  }

  let end = footerIndex + ADDED_CONTEXT_FOOTER.length;
  while (end < text.length && (text[end] === "\n" || text[end] === "\r")) {
    end += 1;
  }

  const detailsBody = text.slice(headingLineEnd + 1, footerIndex);
  const lines = detailsBody.split("\n");
  let inferredType: string | undefined;
  let explicitKind: string | undefined;
  const summaryItems: Array<{ label: string; value: string }> = [];
  const fileReferences: Array<{ label: string; relativePath: string }> = [];
  let inReferences = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      continue;
    }

    if (line.trim() === "- References:") {
      inReferences = true;
      continue;
    }

    if (inReferences) {
      const referenceMatch = /^\s*-\s+([^:]+):\s+(.+)$/.exec(line);
      if (referenceMatch) {
        fileReferences.push({
          label: referenceMatch[1]!.trim(),
          relativePath: referenceMatch[2]!.trim(),
        });
        continue;
      }
      inReferences = false;
    }

    const itemMatch = /^\s*-\s+([^:]+):\s+(.+)$/.exec(line);
    if (!itemMatch) {
      continue;
    }

    const itemLabel = itemMatch[1]!.trim();
    const itemValue = itemMatch[2]!.trim();
    if (itemLabel.toLowerCase() === "kind") {
      explicitKind = normalizeKind(itemValue);
      continue;
    }
    if (itemLabel.toLowerCase() === "type") {
      inferredType = itemValue;
      continue;
    }
    if (
      itemLabel.toLowerCase() === "project" ||
      itemLabel.toLowerCase() === "snapshot file" ||
      itemLabel.toLowerCase() === "context cache directory"
    ) {
      continue;
    }
    summaryItems.push({ label: itemLabel, value: itemValue });
  }

  const attachment: T3WorkContextAttachment = {
    id: `sent-context-${index}-${headingStart}`,
    kind: explicitKind ?? inferKindFromType(inferredType),
    label,
    ...(summaryItems[0]
      ? { description: `${summaryItems[0].label}: ${summaryItems[0].value}` }
      : {}),
    ...(summaryItems.length > 0 ? { summaryItems } : {}),
    ...(fileReferences.length > 0 ? { fileReferences } : {}),
    contextText: text.slice(headingStart, end).trim(),
  };

  return {
    start: headingStart,
    end,
    attachment,
  };
}

export function extractContextAttachmentsFromMessageText(text: string): {
  visibleText: string;
  attachments: T3WorkContextAttachment[];
} {
  if (!text.includes(ADDED_CONTEXT_HEADING) || !text.includes(ADDED_CONTEXT_FOOTER)) {
    return { visibleText: text, attachments: [] };
  }

  const blocks: ParsedContextBlock[] = [];
  let cursor = 0;
  let index = 0;

  while (cursor < text.length) {
    const nextHeading = text.indexOf(ADDED_CONTEXT_HEADING, cursor);
    if (nextHeading < 0) {
      break;
    }
    const parsed = parseContextBlock(text, nextHeading, index);
    if (!parsed) {
      cursor = nextHeading + ADDED_CONTEXT_HEADING.length;
      continue;
    }
    blocks.push(parsed);
    cursor = parsed.end;
    index += 1;
  }

  if (blocks.length === 0) {
    return { visibleText: text, attachments: [] };
  }

  let visibleText = "";
  let sourceCursor = 0;
  for (const block of blocks) {
    visibleText += text.slice(sourceCursor, block.start);
    sourceCursor = block.end;
  }
  visibleText += text.slice(sourceCursor);

  return {
    visibleText: normalizeVisibleText(visibleText),
    attachments: blocks.map((block) => block.attachment),
  };
}
