export type PackCollectionRetention =
  | "keep"
  | { readonly afterUnreadDays: number }
  | { readonly afterUpdateDays: number };

export type PackCollectionDefinition = {
  readonly maxDocBytes: number;
  readonly retention: PackCollectionRetention;
  readonly viewWritable?: boolean;
};

/** Collection names are the top-level keys; quotaBytes is reserved pack-wide metadata. */
export type PackCollectionsDefinition = {
  readonly quotaBytes: number;
  readonly [collection: string]: PackCollectionDefinition | number;
};

const identifier = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

const dataRecord = (value: unknown, field: string): Record<string, unknown> => {
  if (
    typeof value !== "object" ||
    value === null ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error(`${field} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    )
  ) {
    throw new Error(`${field} must contain only enumerable data fields`);
  }
  return value as Record<string, unknown>;
};

const positiveInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer`);
  }
  return value;
};

const decodeRetention = (value: unknown, field: string): PackCollectionRetention => {
  if (value === "keep") return value;
  const rule = dataRecord(value, field);
  const keys = Object.keys(rule);
  if (keys.length !== 1 || (keys[0] !== "afterUnreadDays" && keys[0] !== "afterUpdateDays")) {
    throw new Error(`${field} must be keep or one afterUnreadDays/afterUpdateDays rule`);
  }
  const days = positiveInteger(rule[keys[0]], `${field}.${keys[0]}`);
  return Object.freeze(
    keys[0] === "afterUnreadDays" ? { afterUnreadDays: days } : { afterUpdateDays: days },
  );
};

const decodeCollection = (value: unknown, name: string): PackCollectionDefinition => {
  if (name.length > 256 || !identifier.test(name)) {
    throw new Error(
      `Collection ${name} must be a lowercase pack identifier of at most 256 characters`,
    );
  }
  const data = dataRecord(value, `Collection ${name}`);
  if (
    Object.keys(data).some((key) => !["maxDocBytes", "retention", "viewWritable"].includes(key))
  ) {
    throw new Error(`Collection ${name} contains an unknown field`);
  }
  if (Object.hasOwn(data, "viewWritable") && typeof data.viewWritable !== "boolean") {
    throw new Error(`Collection ${name}.viewWritable must be a boolean`);
  }
  return Object.freeze({
    maxDocBytes: positiveInteger(data.maxDocBytes, `Collection ${name}.maxDocBytes`),
    retention: decodeRetention(data.retention, `Collection ${name}.retention`),
    ...(Object.hasOwn(data, "viewWritable") ? { viewWritable: data.viewWritable as boolean } : {}),
  });
};

/** Validates plain metadata and takes a frozen copy, so later module mutations cannot change caps. */
export const decodePackCollectionsDefinition = (value: unknown): PackCollectionsDefinition => {
  const data = dataRecord(value, "Collections definition");
  const quotaBytes = positiveInteger(data.quotaBytes, "quotaBytes");
  const entries = Object.entries(data).filter(([name]) => name !== "quotaBytes");
  if (entries.length === 0) throw new Error("Collections definition must declare a collection");
  const result: Record<string, PackCollectionDefinition | number> = Object.create(null);
  result.quotaBytes = quotaBytes;
  for (const [name, definition] of entries) result[name] = decodeCollection(definition, name);
  return Object.freeze(result) as PackCollectionsDefinition;
};

export const defineCollections = <const T extends PackCollectionsDefinition>(definition: T): T =>
  decodePackCollectionsDefinition(definition) as T;

/** Runtime packs and compiled distributions use the same collection collision and quota policy. */
export const mergePackCollectionsDefinitions = (
  modules: readonly unknown[],
): PackCollectionsDefinition => {
  const collections: Record<string, unknown> = Object.create(null);
  for (const module of modules) {
    const definition = decodePackCollectionsDefinition(module);
    if (collections.quotaBytes !== undefined && collections.quotaBytes !== definition.quotaBytes) {
      throw new Error("Persistence modules declare conflicting quotaBytes");
    }
    collections.quotaBytes = definition.quotaBytes;
    for (const [name, collection] of Object.entries(definition)) {
      if (name === "quotaBytes") continue;
      if (Object.hasOwn(collections, name)) {
        throw new Error(`Persistence modules declare duplicate collection ${name}`);
      }
      collections[name] = collection;
    }
  }
  return decodePackCollectionsDefinition(collections);
};
