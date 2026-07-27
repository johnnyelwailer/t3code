import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "~/t3team/components/ui/t3team-button";

const CONFIRM_MS = 1600;

/**
 * Copies a URL to the clipboard and says so.
 *
 * Used where the link has to travel out of this browser — pasting a sign-in URL into whichever
 * browser already holds the Atlassian session, for instance. Selecting a long URL by hand is exactly
 * the kind of thing people get wrong halfway through.
 */
export function CopyLinkButton({
  value,
  label = "Copy link",
  className,
  onCopied,
}: {
  readonly value: string;
  readonly label?: string;
  readonly className?: string;
  /** Fires only after a successful copy — never on a refused clipboard write. */
  readonly onCopied?: (() => void) | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), CONFIRM_MS);
      onCopied?.();
    } catch {
      // Clipboard access can be refused outright; leaving the label unchanged is the honest signal,
      // and the URL is selectable in the field beside this button.
      setCopied(false);
    }
  }, [value, onCopied]);

  return (
    <Button
      size="xs"
      variant="outline"
      onClick={() => void copy()}
      className={className}
      aria-label={label}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
