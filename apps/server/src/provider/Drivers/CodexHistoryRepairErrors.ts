import * as Schema from "effect/Schema";

export class CodexHistoryRepairError extends Schema.TaggedErrorClass<CodexHistoryRepairError>()(
  "CodexHistoryRepairError",
  {
    operation: Schema.Literals(["discover", "read", "backup", "write", "verify", "rollback"]),
    providerThreadId: Schema.String,
    filePath: Schema.optionalKey(Schema.String),
    detail: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {
  override get message(): string {
    const file = this.filePath === undefined ? "" : ` at '${this.filePath}'`;
    return `Codex history ${this.operation} failed for provider thread '${this.providerThreadId}'${file}: ${this.detail}`;
  }
}

export function codexHistoryFileSystemError(
  operation: CodexHistoryRepairError["operation"],
  providerThreadId: string,
  filePath: string,
  cause: unknown,
): CodexHistoryRepairError {
  return new CodexHistoryRepairError({
    operation,
    providerThreadId,
    filePath,
    detail: "The provider history could not be read or updated safely.",
    cause,
  });
}
