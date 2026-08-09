/** T3Team adapter for generic capability algebra plus its WorkflowMeta normalizer. */

import type { WorkflowMeta } from "./t3team-sdk.loader.ts";
import { normalizeCapabilityEntries } from "@runbook/threads/capabilities";

export {
  assertChildCapabilitiesSubset,
  assertToolGroupDeclared,
  normalizeCapabilityEntries,
  resolveChildCapabilities,
} from "@runbook/threads/capabilities";

export function normalizeCapabilities(meta: WorkflowMeta): ReadonlySet<string> {
  return normalizeCapabilityEntries(meta.capabilities ?? []);
}
