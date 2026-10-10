/** Host-neutral model references and typed model constructors. */

export interface ModelRef<Id extends string = string, Provider extends string = string> {
  readonly kind: "model";
  readonly id: Id;
  readonly provider: Provider;
}

export interface ModelSelection<Ref extends ModelRef = ModelRef> {
  readonly provider: string;
  readonly model: Ref;
}

/** A provider instance, optionally followed by its exact catalog slug (`instance/slug`). */
export type ModelOption = string | ModelSelection;

export function defineModel<const Provider extends string, const Id extends string>(opts: {
  readonly provider: Provider;
  readonly id: Id;
}): ModelRef<Id, Provider> {
  return Object.freeze({ kind: "model" as const, id: opts.id, provider: opts.provider });
}
