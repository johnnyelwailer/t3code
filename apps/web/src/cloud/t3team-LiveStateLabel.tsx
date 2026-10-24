import type { ReactNode } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

/**
 * A sidebar status word with the longer explanation of a stale or ended state in a tooltip
 * ("Offline — last seen working. Resumes when the connection returns."). Without an explanation it
 * is just the word, so the live row costs nothing.
 */
export function LiveStateLabel({
  explanation,
  children,
}: {
  readonly explanation: string | undefined;
  readonly children: ReactNode;
}) {
  if (explanation === undefined) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span>{children}</span>} />
      <TooltipPopup side="top">{explanation}</TooltipPopup>
    </Tooltip>
  );
}
