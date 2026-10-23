/**
 * `ORCHESTRATION_SIGNAL_SOURCES`: durable source-control and work-item events for workflows.
 *
 * The reconciler reads it once at construction, after `FeatureFlags` loaded user values: off, no
 * source instance ever starts. The workflow verbs read it per call: off, a run cannot register a
 * source and a wait on one fails with {@link WORKFLOW_SIGNAL_SOURCES_OFF} instead of parking on
 * an event nothing will deliver.
 */
import {
  readFeatureFlag,
  type ReadFeatureFlagEnv,
} from "@t3tools/project-context/t3teamFeatureFlags";

export function isWorkflowSignalSourcesEnabled(readEnv?: ReadFeatureFlagEnv): boolean {
  return readFeatureFlag("ORCHESTRATION_SIGNAL_SOURCES", readEnv);
}

export const WORKFLOW_SIGNAL_SOURCES_OFF =
  "Signal sources are turned off on this host (Settings → Features → Orchestration → Signal " +
  "sources), so this workflow cannot wait on a source-control or work-item event. Turn them on " +
  "and restart the app, or change the workflow not to wait on one.";
