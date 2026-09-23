/**
 * The per-run replay drive slot of the workflow host: at most ONE replay drive runs at a time,
 * and work that arrives while one is running is OWED instead of lost.
 *
 * Owed work is drained by the drive that holds the slot, before it lets go: queued drives first
 * (a resume whose reply could not be journaled while busy, or a failure report), else one plain
 * replay. Every replay reads the whole journal, so any number of replies journaled during one
 * drive are owed a single replay, and a queued drive that replays satisfies it too — a queued
 * drive that does NOT replay leaves the owed replay in place. The last "anything owed?" check
 * and the release happen in the same synchronous step, so nothing owed in between is dropped.
 */

type Drive = () => Promise<void>;

export interface WorkflowHostDriveSlot {
  readonly busy: () => boolean;
  /** Run `drive` and then everything owed, holding the slot throughout. Callers check `busy`
   * first; calling it while busy is a no-op (never two drives at once). */
  readonly run: (drive: Drive) => Promise<void>;
  /** While busy: owe one plain replay after the current drive (deduplicated). */
  readonly oweReplay: (replay: Drive) => void;
  /** While busy: owe this whole drive after the current one (kept in arrival order). `replays`
   * says whether it replays the journal; only a drive that does satisfies an owed replay. */
  readonly oweDrive: (drive: Drive, opts?: { readonly replays: boolean }) => void;
}

/** `canContinue` is re-checked before every owed drive: false (run cancelled, settled, or gone
 * from the registry) discards what is owed instead of driving it. */
export function createWorkflowHostDriveSlot(canContinue: () => boolean): WorkflowHostDriveSlot {
  let driving = false;
  let owedReplay: Drive | undefined;
  const owedDrives: Array<{ readonly drive: Drive; readonly replays: boolean }> = [];

  const takeOwed = (): Drive | undefined => {
    if (!canContinue()) {
      owedReplay = undefined;
      owedDrives.length = 0;
      return undefined;
    }
    const queued = owedDrives.shift();
    if (queued === undefined) {
      const replay = owedReplay;
      owedReplay = undefined;
      return replay;
    }
    if (queued.replays) owedReplay = undefined; // it replays the whole journal itself
    return queued.drive;
  };

  const run = async (drive: Drive): Promise<void> => {
    if (driving) return;
    driving = true;
    let failure: { readonly error: unknown } | undefined;
    try {
      for (let next: Drive | undefined = drive; next !== undefined; next = takeOwed()) {
        try {
          await next();
        } catch (error) {
          failure ??= { error }; // still drain: an owed reply must not die with this drive
        }
      }
    } finally {
      driving = false;
    }
    if (failure !== undefined) throw failure.error;
  };

  return {
    busy: () => driving,
    run,
    oweReplay: (replay) => {
      owedReplay = replay;
    },
    oweDrive: (drive, opts) => {
      owedDrives.push({ drive, replays: opts?.replays ?? true });
    },
  };
}
