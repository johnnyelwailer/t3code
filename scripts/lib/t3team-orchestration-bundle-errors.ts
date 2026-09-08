/**
 * Orchestration-bundle probe error classes (split out of
 * scripts/t3team-check-orchestration-bundle.ts for the additive guard's LOC
 * ceiling).
 */
import * as Schema from "effect/Schema";

export class OrchestrationBundleProbeError extends Schema.TaggedErrorClass<OrchestrationBundleProbeError>()(
  "OrchestrationBundleProbeError",
  { exitCode: Schema.Number, output: Schema.String },
) {
  override get message(): string {
    return `The orchestration bundle probe failed (exit ${this.exitCode}). Output:\n${this.output}`;
  }
}

export class OrchestrationBundleDistMissingError extends Schema.TaggedErrorClass<OrchestrationBundleDistMissingError>()(
  "OrchestrationBundleDistMissingError",
  { distDir: Schema.String },
) {
  override get message(): string {
    return `The server dist directory ${this.distDir} does not exist. Build the server first (vp run build:desktop).`;
  }
}

export class OrchestrationBundleClosureError extends Schema.TaggedErrorClass<OrchestrationBundleClosureError>()(
  "OrchestrationBundleClosureError",
  { detail: Schema.String },
) {
  override get message(): string {
    return `The packaged typechecker closure is incomplete: ${this.detail}`;
  }
}
