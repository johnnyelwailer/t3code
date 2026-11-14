/**
 * The offline-banner diagnosis headline, with the pack's product name in place of "T3 Code".
 * Settings still renders the unbranded upstream copy; this is the thread-facing wrapper.
 */
import { useConnectionDiagnosis } from "~/components/settings/ConnectionDiagnosisDetails";
import type { EnvironmentPresentation } from "~/state/environments";
import { useT3TeamAppBaseName } from "./t3team-appBrandName";
import { brandUpstreamProductName } from "./t3team-brandUpstreamProductName";

export function T3TeamConnectionDiagnosisHeadline({
  environment,
}: {
  readonly environment: EnvironmentPresentation;
}) {
  const productName = useT3TeamAppBaseName();
  const headline = useConnectionDiagnosis(environment).diagnosis?.headline ?? null;
  if (headline === null) return null;
  return brandUpstreamProductName(headline, productName);
}
