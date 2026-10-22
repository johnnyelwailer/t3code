/** A recording that never began is not a miss: say so, instead of "didn't catch that". */
export const failedTitle = (detail: string | null): string =>
  detail !== null && /start|prepare|available|exist|model/i.test(detail)
    ? "Couldn’t start voice"
    : "Didn’t catch that";
