import type { EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useCallback } from "react";

import {
  CLOUD_SESSION_DURATION_CHOICES,
  DEFAULT_CLOUD_SESSION_DURATION_SECONDS,
} from "~/components/cloud/t3team-CloudSessionProvisionPanel";
import { useLocalStorage } from "~/hooks/useLocalStorage";

/**
 * The cloud session duration the user last picked, remembered per environment
 * in local storage (the same mechanism as the last-invoked script per project),
 * so the picker survives a reload and both surfaces — the settings panel and
 * the "Run on" menu — start at the same choice.
 */

export const CLOUD_SESSION_DURATION_BY_ENVIRONMENT_KEY =
  "t3code:cloud-session-duration-by-environment";

const DurationByEnvironmentSchema = Schema.Record(Schema.String, Schema.Int);
const NO_DURATIONS: Record<string, number> = {};

/** A stored value only counts if the picker still offers it; anything else reads as the default. */
export function resolveCloudSessionDuration(stored: number | undefined): number {
  return CLOUD_SESSION_DURATION_CHOICES.some((choice) => choice.seconds === stored)
    ? (stored as number)
    : DEFAULT_CLOUD_SESSION_DURATION_SECONDS;
}

export function useCloudSessionDuration(
  environmentId: EnvironmentId | null,
): readonly [number, (seconds: number) => void] {
  const [byEnvironment, setByEnvironment] = useLocalStorage(
    CLOUD_SESSION_DURATION_BY_ENVIRONMENT_KEY,
    NO_DURATIONS,
    DurationByEnvironmentSchema,
  );
  const durationSeconds = resolveCloudSessionDuration(
    environmentId === null ? undefined : byEnvironment[String(environmentId)],
  );
  const setDurationSeconds = useCallback(
    (seconds: number) => {
      if (environmentId === null) return;
      setByEnvironment((current) => ({ ...current, [String(environmentId)]: seconds }));
    },
    [environmentId, setByEnvironment],
  );
  return [durationSeconds, setDurationSeconds] as const;
}
