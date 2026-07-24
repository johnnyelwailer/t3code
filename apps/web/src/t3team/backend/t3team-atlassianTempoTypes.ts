export type TempoUserCapacity = {
  readonly accountId: string;
  readonly requiredSeconds: number;
  readonly plannedSeconds: number;
  readonly capacitySeconds: number;
  readonly workingDays: number;
  readonly error?: string;
};

export type TempoCapacityResponse = {
  readonly configured: boolean;
  readonly from: string;
  readonly to: string;
  readonly capacities: ReadonlyArray<TempoUserCapacity>;
};
