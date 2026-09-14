import * as Schema from "effect/Schema";

export class ServerCliCommandExitError extends Schema.TaggedErrorClass<ServerCliCommandExitError>()(
  "ServerCliCommandExitError",
  {
    command: Schema.String,
    args: Schema.Array(Schema.String),
    cwd: Schema.optional(Schema.String),
    exitCode: Schema.Int,
  },
) {
  override get message(): string {
    return `Command exited with non-zero exit code (${this.exitCode})`;
  }
}

export class ServerCliPublishIconSourceMissingError extends Schema.TaggedErrorClass<ServerCliPublishIconSourceMissingError>()(
  "ServerCliPublishIconSourceMissingError",
  {
    sourcePath: Schema.String,
  },
) {
  override get message(): string {
    return `Missing publish icon source: ${this.sourcePath}`;
  }
}

export class ServerCliPublishIconTargetMissingError extends Schema.TaggedErrorClass<ServerCliPublishIconTargetMissingError>()(
  "ServerCliPublishIconTargetMissingError",
  {
    targetPath: Schema.String,
  },
) {
  override get message(): string {
    return `Missing publish icon target: ${this.targetPath}. Run the build subcommand first.`;
  }
}

export class ServerCliDevelopmentIconSourceMissingError extends Schema.TaggedErrorClass<ServerCliDevelopmentIconSourceMissingError>()(
  "ServerCliDevelopmentIconSourceMissingError",
  {
    sourcePath: Schema.String,
  },
) {
  override get message(): string {
    return `Missing development icon source: ${this.sourcePath}`;
  }
}

export class ServerCliDevelopmentIconTargetMissingError extends Schema.TaggedErrorClass<ServerCliDevelopmentIconTargetMissingError>()(
  "ServerCliDevelopmentIconTargetMissingError",
  {
    targetPath: Schema.String,
  },
) {
  override get message(): string {
    return `Missing development icon target: ${this.targetPath}. Build web first.`;
  }
}

export class ServerCliBuildAssetMissingError extends Schema.TaggedErrorClass<ServerCliBuildAssetMissingError>()(
  "ServerCliBuildAssetMissingError",
  {
    assetPath: Schema.String,
  },
) {
  override get message(): string {
    return `Missing build asset: ${this.assetPath}. Run the build subcommand first.`;
  }
}

export class ServerCliWebClientMissingError extends Schema.TaggedErrorClass<ServerCliWebClientMissingError>()(
  "ServerCliWebClientMissingError",
  {
    webDist: Schema.String,
  },
) {
  override get message(): string {
    return (
      `The web client was not built into ${this.webDist} even after running the web build; ` +
      `the packed server cannot serve its UI (first boot would answer 503 on "/"). ` +
      `Fix the web build and re-run the server build.`
    );
  }
}

export class ServerCliDistributionNotInlinedError extends Schema.TaggedErrorClass<ServerCliDistributionNotInlinedError>()(
  "ServerCliDistributionNotInlinedError",
  {
    distributionDir: Schema.String,
    expectedMarkers: Schema.Array(Schema.String),
    scannedFiles: Schema.Int,
  },
) {
  override get message(): string {
    return (
      `T3CODE_DISTRIBUTION names ${this.distributionDir}, but none of its markers ` +
      `(${this.expectedMarkers.length > 0 ? this.expectedMarkers.join(", ") : "none derivable from distribution.json"}) ` +
      `appear in the ${this.scannedFiles} emitted dist/*.mjs file(s): the distribution was NOT compiled in. ` +
      `The packed server would boot with the empty distribution stub (no provider, no branding, no theme). ` +
      `A build that was asked to inline a distribution must fail here, not succeed quietly. ` +
      `Check that T3CODE_DISTRIBUTION reached the pack step and that apps/server/vite.config.ts still ` +
      `registers t3teamDistributionPackPlugin.`
    );
  }
}
