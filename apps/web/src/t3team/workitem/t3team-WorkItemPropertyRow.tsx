import type { ReactNode } from "react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { cn } from "~/t3team/lib/t3team-utils";

/**
 * One labelled property.
 *
 * A row renders nothing when it has no value. Jira lists every configured field with an
 * "Unspecified" placeholder; a rail of placeholders is noise, so absent fields simply do not appear
 * — and in Slice B an "add field" affordance is how you set one that is missing.
 *
 * Emptiness is decided from `value`/`values` rather than from `children`, because a child element
 * that renders `null` is still a truthy React node — checking the node would keep the label and
 * leave a blank value beside it, which is precisely the placeholder row this avoids.
 */
export function WorkItemPropertyRow({
  label,
  value,
  values,
  children,
  stacked = false,
  className,
}: {
  readonly label: string;
  /** Present-ness test for a scalar property. */
  readonly value?: string | number | undefined;
  /** Present-ness test for a list property. */
  readonly values?: ReadonlyArray<unknown> | undefined;
  /** Rendered content. Defaults to `value` when omitted. */
  readonly children?: ReactNode;
  readonly stacked?: boolean;
  readonly className?: string;
}) {
  const hasValue = values !== undefined ? values.length > 0 : value !== undefined && value !== "";
  if (!hasValue) return null;

  return (
    <div
      className={cn(
        stacked
          ? "flex flex-col gap-1"
          : "grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1",
        className,
      )}
    >
      <dt className="pt-px text-xs leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-xs leading-5 text-foreground">
        {children ?? <span className="break-words">{value}</span>}
      </dd>
    </div>
  );
}

/**
 * A list of short values as chips. Long lists wrap onto further lines rather than becoming a scroll
 * region — labels and components are usually few, and truncating them would hide information that
 * fits perfectly well on a second line.
 */
export function WorkItemPropertyChips({
  values,
  className,
}: {
  readonly values: ReadonlyArray<string>;
  readonly className?: string;
}) {
  if (values.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {values.map((value) => (
        <Badge key={value} variant="outline" size="sm" className="font-normal">
          {value}
        </Badge>
      ))}
    </div>
  );
}
