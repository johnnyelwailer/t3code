export const T3TEAM_CONTEXT_AVAILABILITY_SUMMARY = "summary" as const;
export const T3TEAM_CONTEXT_AVAILABILITY_FULL = "full" as const;

export type T3TeamContextAvailability =
  | typeof T3TEAM_CONTEXT_AVAILABILITY_SUMMARY
  | typeof T3TEAM_CONTEXT_AVAILABILITY_FULL;

export type T3TeamContextAvailabilityFields = {
  readonly availability: T3TeamContextAvailability;
  readonly loadableOnDemand?: boolean;
  readonly fullBundleRootRelativePath?: string;
  readonly syncedAt?: string;
};

export function isT3TeamContextAvailability(value: unknown): value is T3TeamContextAvailability {
  return (
    value === T3TEAM_CONTEXT_AVAILABILITY_SUMMARY || value === T3TEAM_CONTEXT_AVAILABILITY_FULL
  );
}
