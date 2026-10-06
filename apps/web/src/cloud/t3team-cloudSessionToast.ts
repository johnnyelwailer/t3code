import type * as Cause from "effect/Cause";

import { toastManager } from "~/components/ui/toast";
import { cloudSessionFailureDescription } from "./t3team-cloudSessionFailureDescription";

/**
 * Shows the error toast for a failed cloud-session command, keeping the
 * failure-toast shape in one place. The description is derived from the cause
 * via `cloudSessionFailureDescription`.
 */
export function showCloudSessionFailureToast(
  title: string,
  result: { readonly cause: Cause.Cause<unknown> },
): void {
  toastManager.add({
    type: "error",
    title,
    description: cloudSessionFailureDescription(result),
  });
}
