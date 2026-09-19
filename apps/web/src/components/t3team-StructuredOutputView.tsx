import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  formatInstantLocal,
  isIsoInstant,
  isStructuredOutput,
  parseStructuredOutput,
} from "@t3tools/shared/t3team-structuredOutput";

/**
 * Generic, provider-agnostic viewer for structured (JSON) output.
 *
 * When `raw` is (optionally status-prefixed) JSON it renders a structured,
 * expandable key/value view — complete, with ISO timestamps in the viewer's
 * local time. When it is not JSON it falls back to the raw string unchanged.
 * This is the shared "result/error renderer" foundation: it knows no
 * provider-specific field names or titles.
 *
 * @module StructuredOutputView
 */

export interface StructuredOutputViewProps {
  /** The raw string to render (e.g. a thread error or a tool result). */
  readonly raw: string;
  /** Class for the outer container. */
  readonly className?: string;
  /** Compact mode: status + top-level count only, no rows (for tight surfaces). */
  readonly compact?: boolean;
}

type JsonValue = Record<string, unknown> | readonly unknown[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContainer(value: unknown): value is JsonValue {
  return isPlainObject(value) || Array.isArray(value);
}

function renderScalar(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (isIsoInstant(value)) return formatInstantLocal(value) ?? value;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "null";
}

function StatusBadge({ status }: { readonly status: number }) {
  const isError = status >= 400;
  const tone = isError ? "text-destructive border-destructive/40 bg-destructive/10" : "text-foreground/60 border-border bg-muted";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}

export function StructuredOutputView({
  raw,
  className,
  compact = false,
}: StructuredOutputViewProps) {
  const output = parseStructuredOutput(raw);
  if (!isStructuredOutput(output) || output.value === null) {
    return <span className={className}>{raw}</span>;
  }
  const value = output.value;
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  if (compact) {
    return (
      <span className={className}>
        {output.status !== null ? <StatusBadge status={output.status} /> : null}
        <span className="ml-1.5 text-foreground/50">{count} fields</span>
      </span>
    );
  }
  return (
    <div className={className}>
      {output.status !== null ? (
        <div className="mb-1.5">
          <StatusBadge status={output.status} />
        </div>
      ) : null}
      <Node value={value} />
    </div>
  );
}

function Node({ value }: { readonly value: JsonValue }) {
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-col gap-0.5">
        {value.map((item, index) => (
          <Row key={index} label={`[${index}]`} value={item} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {Object.entries(value).map(([key, entry]) => (
        <Row key={key} label={key} value={entry} />
      ))}
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: unknown }) {
  if (isContainer(value)) {
    return <ExpandableRow label={label} value={value} />;
  }
  return (
    <div className="flex gap-2 text-sm leading-snug">
      <span className="shrink-0 font-mono text-foreground/50">{label}</span>
      <span className="min-w-0 break-words">{renderScalar(value)}</span>
    </div>
  );
}

function ExpandableRow({ label, value }: { readonly label: string; readonly value: JsonValue }) {
  const [open, setOpen] = useState(false);
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  const noun = Array.isArray(value) ? "items" : "fields";
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
        className="flex items-center gap-1 text-sm"
      >
        {open ? (
          <ChevronDown className="size-3 text-foreground/40" />
        ) : (
          <ChevronRight className="size-3 text-foreground/40" />
        )}
        <span className="font-mono text-foreground/50">{label}</span>
        <span className="text-foreground/40">
          {count} {noun}
        </span>
      </button>
      {open ? (
        <div className="ml-4 mt-0.5 border-l border-border pl-3">
          <Node value={value} />
        </div>
      ) : null}
    </div>
  );
}
