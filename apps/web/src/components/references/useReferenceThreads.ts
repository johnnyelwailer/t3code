import { useMemo } from "react";
import type {
  EnvironmentId,
  ReferenceLinkedThreadsInput,
  ReferenceThreadSource,
} from "@t3tools/contracts";

import { useThreadShells } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { referenceEnvironment } from "~/state/references";

import {
  groupReferenceThreads,
  type ReferenceThreadRow,
  type ReferenceThreadSection,
} from "./referenceThreads.logic";

export interface ReferenceThreadsView {
  readonly sections: readonly ReferenceThreadSection[];
  readonly total: number;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
}

/**
 * Resolve a reference's roster and group it live. The RPC supplies the related set (ids + source);
 * the live thread shells supply the grouping fields, so a thread's shelf follows its current
 * running/snoozed/settled state as it changes. Roster threads that have left the live snapshot
 * (archived between the read and the render) drop out.
 */
export function useReferenceThreads(
  environmentId: EnvironmentId,
  input: ReferenceLinkedThreadsInput,
): ReferenceThreadsView {
  const query = useEnvironmentQuery(
    referenceEnvironment.linkedThreads({ environmentId, input }),
  );
  const shells = useThreadShells();
  // Stable within a minute so the grouping is not recomputed on every unrelated render, yet still
  // re-evaluates snooze expiry on the next boundary after the shells change.
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const grouped = useMemo(() => {
    const sourceById = new Map<string, ReferenceThreadSource>();
    for (const row of query.data?.threads ?? []) sourceById.set(row.id, row.source);
    const merged: ReferenceThreadRow[] = shells
      .filter((shell) => shell.environmentId === environmentId && sourceById.has(shell.id))
      .map((shell) => ({ ...shell, source: sourceById.get(shell.id) as ReferenceThreadSource }));
    return {
      sections: groupReferenceThreads(merged, now),
      total: merged.length,
    };
  }, [query.data, shells, environmentId, now]);
  return {
    sections: grouped.sections,
    total: grouped.total,
    error: query.error,
    isPending: query.isPending,
    refresh: query.refresh,
  };
}
