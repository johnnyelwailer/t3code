/**
 * The catalog hosts' shared params check: every built-in `start` validates the RAW stored params
 * against its declaration schema before doing anything, so a malformed registration (a
 * hand-written row, an older host) fails that instance's start, not the whole reconciler sweep.
 */
import * as Schema from "effect/Schema";

export async function validateParams<Value>(
  schema: Schema.Decoder<Value>,
  params: unknown,
  sourceName: string,
): Promise<Value> {
  try {
    return await Schema.decodeUnknownPromise(schema)(params);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Stored params for signal source '${sourceName}' failed its declaration schema: ${detail}`,
      { cause: error },
    );
  }
}
