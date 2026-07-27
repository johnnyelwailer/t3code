import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";

const COPY_CONFIRMATION_MS = 1500;

/**
 * Collapsed-by-default technical detail disclosure shared by the block/page and
 * inline `T3TeamErrorState` variants. A real `<button aria-expanded>` toggle so
 * the copy button never ends up nested inside a `<summary>`.
 */
export function T3TeamErrorTechnicalDisclosure({
  technical,
  compact = false,
}: {
  readonly technical: string;
  readonly compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyTechnical() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(technical).then(() => {
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
    });
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={
          compact
            ? "inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            : "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        }
      >
        {open ? (
          <ChevronDown className="size-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3" aria-hidden="true" />
        )}
        Technical details
      </button>

      {open ? (
        <div className="mt-1.5 space-y-1.5">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
            {technical}
          </pre>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-label="Copy technical details"
            onClick={copyTechnical}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
