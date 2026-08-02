import * as Schema from "effect/Schema";

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Decode an author or handler value while preserving the SDK's stable message shape. */
export async function decodeWithSchema<Value>(
  schema: Schema.Schema<Value>,
  input: unknown,
  message: string,
): Promise<Value> {
  try {
    return await (Schema.decodeUnknownPromise(schema as never)(input) as Promise<Value>);
  } catch (error) {
    throw new Error(`${message}: ${formatError(error)}`, { cause: error });
  }
}
