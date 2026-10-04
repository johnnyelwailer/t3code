import { useCallback, useMemo } from "react";

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

/**
 * Session lengths offered in the panel. The provisioning job holds the machine
 * for the chosen span and then stops itself, so this is the only knob that has
 * to exist — everything else (which repo, which branch, which secrets) is
 * already fixed by the workspace pack.
 */
export const CLOUD_SESSION_DURATION_CHOICES = [
  { seconds: 3600, label: "1 hour" },
  { seconds: 4 * 3600, label: "4 hours" },
  { seconds: 8 * 3600, label: "8 hours" },
] as const;

export const DEFAULT_CLOUD_SESSION_DURATION_SECONDS = 4 * 3600;

/** The "Runs for" picker beside the panel's create button. */
export function CloudSessionDurationSelect({
  durationSeconds,
  onDurationChange,
}: {
  readonly durationSeconds: number;
  readonly onDurationChange?: ((seconds: number) => void) | undefined;
}) {
  const handleChange = useCallback(
    (value: string | null) => {
      if (value === null) return;
      onDurationChange?.(Number(value));
    },
    [onDurationChange],
  );
  const items = useMemo(
    () =>
      CLOUD_SESSION_DURATION_CHOICES.map((choice) => ({
        value: String(choice.seconds),
        label: choice.label,
      })),
    [],
  );
  return (
    <Select
      modal={false}
      value={String(durationSeconds)}
      onValueChange={handleChange}
      items={items}
    >
      <SelectTrigger size="sm" className="w-24 min-w-0" aria-label="Runs for">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
