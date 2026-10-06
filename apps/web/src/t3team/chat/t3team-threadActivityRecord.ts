/**
 * A fork thread activity: one typed event a fork layer reports for a thread (recipe launch,
 * workflow card, workflow step progress).
 *
 * V2 threads have no activity log; these records reach the client on a fork side stream, and the
 * recipe/workflow views read this shape regardless of the carrier. Keep it the narrow structural
 * subset those views read.
 */
export interface T3TeamThreadActivityRecord {
  readonly id: string;
  readonly kind: string;
  readonly tone?: "info" | "tool" | "approval" | "error" | undefined;
  readonly summary?: string | undefined;
  readonly payload: unknown;
  readonly createdAt: string;
  /** Producer order; records without one sort after those that have it, by `createdAt`. */
  readonly sequence?: number | undefined;
  readonly turnId?: string | null | undefined;
}
