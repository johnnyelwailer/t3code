/**
 * Effect <-> Promise plumbing for one pack adapter method: encode the host input to JSON, await
 * the pack's Promise, decode the JSON result. Every failure (encode, rejection, undecodable
 * result) becomes the method's own `ProviderAdapterV2Error` so the orchestrator handles a pack
 * exactly like a built-in adapter.
 *
 * @module t3team-pack-driverCall
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export interface PackCall<E> {
  readonly call: <A>(run: () => Promise<A>) => Effect.Effect<A, E>;
  readonly encode: <T, J>(codec: Schema.Codec<T, J>, value: T) => Effect.Effect<J, E>;
  readonly decode: <T, J>(codec: Schema.Codec<T, J>, raw: unknown) => Effect.Effect<T, E>;
}

export const packCall = <E>(toError: (cause: unknown) => E): PackCall<E> => ({
  call: (run) => Effect.tryPromise({ try: run, catch: toError }),
  encode: (codec, value) => Schema.encodeEffect(codec)(value).pipe(Effect.mapError(toError)),
  decode: (codec, raw) => Schema.decodeUnknownEffect(codec)(raw).pipe(Effect.mapError(toError)),
});

/** Encode, call, decode in one step. */
export const packRoundTrip = <E, I, IJ, O, OJ>(
  bridge: PackCall<E>,
  input: { readonly codec: Schema.Codec<I, IJ>; readonly value: I },
  run: (encoded: IJ) => Promise<unknown>,
  output: Schema.Codec<O, OJ>,
): Effect.Effect<O, E> =>
  bridge.encode(input.codec, input.value).pipe(
    Effect.flatMap((encoded) => bridge.call(() => run(encoded))),
    Effect.flatMap((raw) => bridge.decode(output, raw)),
  );

export const errorDetail = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
