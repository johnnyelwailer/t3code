import { useEffect, useState } from "react";

import { getUpdateNotesAttention } from "./t3team-nexiUpdateNotice.logic";
import { readKey, writeKey } from "./t3team-updateNoticeStorage";

const POPPED_KEY = "update.notes.poppedVersion";
const SEEN_KEY = "update.notes.seenVersion";

/** The pill's dot and one automatic notes pop per app version, remembered per viewer. */
export function useUpdateNotesAttention(version: string | null) {
  const [popped, setPopped] = useState(() => readKey(POPPED_KEY));
  const [seen, setSeen] = useState(() => readKey(SEEN_KEY));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- persists the popped version to browser storage
  useEffect(() => {
    if (popped !== null) writeKey(POPPED_KEY, popped);
  }, [popped]);
  return {
    ...getUpdateNotesAttention(version, popped, seen),
    /** Render-safe: records the pop; storage follows in an effect. */
    markPopped: () => {
      if (version !== null) setPopped(version);
    },
    markSeen: () => {
      if (version === null || seen === version) return;
      writeKey(SEEN_KEY, version);
      setSeen(version);
    },
  };
}
