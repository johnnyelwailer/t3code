export const T3WORK_CONTEXT_AVAILABILITY_SUMMARY = "summary" as const;
export const T3WORK_CONTEXT_AVAILABILITY_FULL = "full" as const;

export type T3workContextAvailability =
  | typeof T3WORK_CONTEXT_AVAILABILITY_SUMMARY
  | typeof T3WORK_CONTEXT_AVAILABILITY_FULL;

export type T3workContextAvailabilityFields = {
  readonly availability: T3workContextAvailability;
  readonly loadableOnDemand?: boolean;
  readonly fullBundleRootRelativePath?: string;
  readonly syncedAt?: string;
};

export function isT3workContextAvailability(value: unknown): value is T3workContextAvailability {
  return (
    value === T3WORK_CONTEXT_AVAILABILITY_SUMMARY || value === T3WORK_CONTEXT_AVAILABILITY_FULL
  );
}
