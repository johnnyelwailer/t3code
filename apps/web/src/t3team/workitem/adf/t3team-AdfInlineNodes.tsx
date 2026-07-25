import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { ADF_TONE_CHIP_CLASSES, adfStatusTone } from "./t3team-adfColorTokens";
import { T3TeamAdfCardChip } from "./t3team-AdfLinkParts";
import { T3TeamAdfMarkedText } from "./t3team-AdfTextMarks";
import { adfAttrString, type AdfNodeProps, type AdfNodeRenderers } from "./t3team-adfRendererTypes";

const INLINE_CHIP_CLASS =
  "inline-flex items-baseline rounded-md border px-1.5 py-px align-baseline text-xs font-medium";

/** ADF stores epoch strings; the editor emits milliseconds, the docs show seconds. */
function formatAdfDate(timestamp: string | undefined): string | undefined {
  if (timestamp === undefined || !/^\d+$/.test(timestamp)) return undefined;
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return undefined;
  const millis = timestamp.length > 11 ? value : value * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function T3TeamAdfText({ node, ctx }: AdfNodeProps): ReactNode {
  return <T3TeamAdfMarkedText node={node} ctx={ctx} />;
}

function T3TeamAdfHardBreak(): ReactNode {
  return <br />;
}

function T3TeamAdfEmoji({ node }: AdfNodeProps): ReactNode {
  const shortName = adfAttrString(node, "shortName");
  const text = adfAttrString(node, "text") ?? shortName;
  if (text === undefined) return null;
  return (
    <span role="img" aria-label={shortName ?? text}>
      {text}
    </span>
  );
}

function T3TeamAdfDate({ node }: AdfNodeProps): ReactNode {
  const formatted = formatAdfDate(adfAttrString(node, "timestamp"));
  if (formatted === undefined) return null;
  return (
    <time className={cn(INLINE_CHIP_CLASS, ADF_TONE_CHIP_CLASSES.muted)} data-adf-node="date">
      {formatted}
    </time>
  );
}

function T3TeamAdfStatus({ node }: AdfNodeProps): ReactNode {
  const text = adfAttrString(node, "text");
  if (text === undefined) return null;
  const tone = adfStatusTone(adfAttrString(node, "color"));
  return (
    <span
      className={cn(
        INLINE_CHIP_CLASS,
        "font-semibold uppercase tracking-wide",
        ADF_TONE_CHIP_CLASSES[tone],
      )}
      data-adf-node="status"
    >
      {text}
    </span>
  );
}

function T3TeamAdfMention({ node }: AdfNodeProps): ReactNode {
  const accountId = adfAttrString(node, "id");
  const raw = adfAttrString(node, "text") ?? accountId;
  if (raw === undefined) return null;
  const label = raw.startsWith("@") ? raw : `@${raw}`;
  return (
    <span
      className={cn(INLINE_CHIP_CLASS, ADF_TONE_CHIP_CLASSES.primary)}
      data-adf-node="mention"
      data-adf-account-id={accountId}
    >
      {label}
    </span>
  );
}

function T3TeamAdfInlineCard({ node, ctx }: AdfNodeProps): ReactNode {
  return <T3TeamAdfCardChip url={adfAttrString(node, "url")} ctx={ctx} />;
}

export const adfInlineNodeRenderers: AdfNodeRenderers = {
  text: T3TeamAdfText,
  hardBreak: T3TeamAdfHardBreak,
  emoji: T3TeamAdfEmoji,
  date: T3TeamAdfDate,
  status: T3TeamAdfStatus,
  mention: T3TeamAdfMention,
  inlineCard: T3TeamAdfInlineCard,
};
