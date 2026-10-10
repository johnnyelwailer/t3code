/**
 * The pack a rendered pack view belongs to. The host binds it around every pack component, so a
 * pack-ui hook (`usePackDocument`) acts for the calling pack without the pack passing its id —
 * and cannot act for another pack.
 */
import { createContext, useContext } from "react";

export const PackScopeContext = createContext<string | null>(null);

/** The calling pack's id; throws outside a pack view, where there is no pack to act for. */
export function usePackScope(): string {
  const packId = useContext(PackScopeContext);
  if (packId === null) throw new Error("pack-ui hooks can only be used inside a pack view");
  return packId;
}
