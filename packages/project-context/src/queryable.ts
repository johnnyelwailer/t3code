export type QueryableState = "idle" | "loading" | "ready" | "error";

export const QueryableTypeId: unique symbol = Symbol.for("@t3tools/project-context/Queryable");

export interface Queryable<T> {
  readonly [QueryableTypeId]: true;
  readonly state: QueryableState;
  some(
    predicate?: (value: T, index: number, array: ReadonlyArray<T>) => unknown,
    thisArg?: unknown,
  ): boolean;
  where(predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown): Queryable<T>;
  count(): number;
  first(): T | undefined;
  toReadonlyArray(): ReadonlyArray<T>;
  toJSON(): SerializableQueryable<T>;
}

export type SerializableQueryable<T> = {
  readonly state: QueryableState;
  readonly items: ReadonlyArray<T>;
};

export type QueryableLike<T> =
  | Queryable<T>
  | ReadonlyArray<T>
  | {
      readonly state?: QueryableState;
      readonly items?: ReadonlyArray<T>;
    };

class QueryableList<T> implements Queryable<T> {
  readonly [QueryableTypeId] = true as const;
  private readonly items: ReadonlyArray<T>;
  readonly state: QueryableState;

  constructor(items: ReadonlyArray<T>, state: QueryableState) {
    this.items = items;
    this.state = state;
  }

  get length(): number {
    return this.items.length;
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.items[Symbol.iterator]();
  }

  includes(value: T): boolean {
    return this.items.includes(value);
  }

  map<U>(callback: (value: T, index: number, array: ReadonlyArray<T>) => U): ReadonlyArray<U> {
    return this.items.map(callback);
  }

  filter(
    predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown,
  ): ReadonlyArray<T> {
    return this.items.filter(predicate);
  }

  find(predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown): T | undefined {
    return this.items.find(predicate);
  }

  some(
    predicate?: (value: T, index: number, array: ReadonlyArray<T>) => unknown,
    thisArg?: unknown,
  ): boolean {
    if (predicate === undefined) {
      return this.items.length > 0;
    }
    return this.items.some(predicate, thisArg);
  }

  where(predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown): Queryable<T> {
    return new QueryableList(this.items.filter(predicate), this.state);
  }

  count(): number {
    return this.items.length;
  }

  first(): T | undefined {
    return this.items[0];
  }

  toReadonlyArray(): ReadonlyArray<T> {
    return this.items;
  }

  toJSON(): SerializableQueryable<T> {
    return {
      state: this.state,
      items: this.items,
    };
  }
}

export function isQueryable<T>(value: unknown): value is Queryable<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    QueryableTypeId in (value as Record<PropertyKey, unknown>)
  );
}

function isSerializableQueryable<T>(
  value: QueryableLike<T> | undefined,
): value is Extract<QueryableLike<T>, { readonly items?: ReadonlyArray<T> }> {
  return typeof value === "object" && value !== null && "items" in value;
}

export function createQueryable<T>(
  items: ReadonlyArray<T>,
  state: QueryableState = "ready",
): Queryable<T> {
  return new QueryableList(items, state);
}

export function normalizeQueryable<T>(
  input: QueryableLike<T> | undefined,
  fallbackState: QueryableState = "ready",
): Queryable<T> {
  if (isQueryable<T>(input)) {
    return input;
  }
  if (Array.isArray(input)) {
    return createQueryable(input, fallbackState);
  }
  if (isSerializableQueryable(input) && Array.isArray(input.items)) {
    return createQueryable(input.items, input.state ?? fallbackState);
  }
  return createQueryable([], fallbackState);
}

export function queryableToReadonlyArray<T>(input: Queryable<T> | undefined): ReadonlyArray<T> {
  return input?.toReadonlyArray() ?? [];
}
