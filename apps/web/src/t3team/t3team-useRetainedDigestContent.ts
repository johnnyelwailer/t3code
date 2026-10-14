/**
 * Once the digest has shown work, an empty answer that is not an answer yet (a Jira sync still
 * refilling the mirror) must not take it away: the last content with something in it stays on
 * screen until a result that can be believed arrives.
 */
import { useState } from "react";

export function useRetainedDigestContent<T>(
  current: T,
  hasContent: boolean,
  notAnAnswerYet: boolean,
): T {
  const [kept, setKept] = useState<T | null>(hasContent ? current : null);
  if (hasContent && kept !== current) setKept(current);
  return !hasContent && notAnAnswerYet && kept !== null ? kept : current;
}
