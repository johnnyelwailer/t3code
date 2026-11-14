import { getUpdateNotesAttention } from "./t3team-nexiUpdateNotice.logic";
import { useStoredKey, writeKey } from "./t3team-updateNoticeStorage";

const POPPED_KEY = "update.notes.poppedVersion";
const SEEN_KEY = "update.notes.seenVersion";

/** The dot and one automatic notes pop per app version, shared by the pill and the Nexi footer. */
export function useUpdateNotesAttention(version: string | null) {
  const popped = useStoredKey(POPPED_KEY);
  const seen = useStoredKey(SEEN_KEY);
  return {
    ...getUpdateNotesAttention(version, popped, seen),
    markPopped: () => {
      if (version !== null) writeKey(POPPED_KEY, version);
    },
    markSeen: () => {
      if (version !== null && seen !== version) writeKey(SEEN_KEY, version);
    },
  };
}
