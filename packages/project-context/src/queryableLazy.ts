import {
  createQueryable,
  QueryableTypeId,
  type Queryable,
  type QueryableState,
  type SerializableQueryable,
} from "./queryable.ts";

/**
 * Lazy tier of the Array-backed `Queryable<T>` contract (Epic 16, "Lazy loading and
 * visibility-while-loading"): accessing a queryable in `idle` state triggers the async
 * load, the current evaluation receives sentinel results (`false` / `0` / `undefined`),
 * and the host is notified when data is ready so it can invalidate dependents.
 *
 * One polymorphic type covers eager and lazy collections — consumers only see
 * `Queryable<T>`; the host owns load policy.
 */
export type LazyQueryableLoad<T> = () => Promise<ReadonlyArray<T>>;

export type LazyQueryableOptions = {
  /**
   * Host invalidation hook: fired on `idle → loading`, `loading → ready`, and
   * `loading → error` transitions. On `ready`/`error` the host should re-evaluate
   * consumers whose access set touched this queryable.
   */
  readonly onStateChange?: (state: QueryableState) => void;
};

type Predicate<T> = (value: T, index: number, array: ReadonlyArray<T>) => unknown;

class LazyQueryable<T> implements Queryable<T> {
  readonly [QueryableTypeId] = true as const;
  private status: QueryableState = "idle";
  private resolved: Queryable<T> | undefined;
  private readonly load: LazyQueryableLoad<T>;
  private readonly onStateChange: ((state: QueryableState) => void) | undefined;

  constructor(load: LazyQueryableLoad<T>, options?: LazyQueryableOptions) {
    this.load = load;
    this.onStateChange = options?.onStateChange;
  }

  get state(): QueryableState {
    return this.status;
  }

  private transition(state: QueryableState): void {
    this.status = state;
    this.onStateChange?.(state);
  }

  /** Single-flight: the first access in `idle` starts the load; later accesses reuse it. */
  private access(): Queryable<T> | undefined {
    if (this.resolved !== undefined) {
      return this.resolved;
    }
    if (this.status === "idle") {
      this.transition("loading");
      this.load().then(
        (items) => {
          this.resolved = createQueryable(items, "ready");
          this.transition("ready");
        },
        () => {
          this.transition("error");
        },
      );
    }
    return undefined;
  }

  some(predicate?: Predicate<T>, thisArg?: unknown): boolean {
    return this.access()?.some(predicate, thisArg) ?? false;
  }

  where(predicate: Predicate<T>): Queryable<T> {
    // Lazy composition: building a view does not trigger the load — terminal reads do.
    if (this.resolved !== undefined) {
      return this.resolved.where(predicate);
    }
    return new LazyQueryableView(this, predicate);
  }

  count(): number {
    return this.access()?.count() ?? 0;
  }

  first(): T | undefined {
    return this.access()?.first();
  }

  toReadonlyArray(): ReadonlyArray<T> {
    return this.access()?.toReadonlyArray() ?? [];
  }

  toJSON(): SerializableQueryable<T> {
    return this.access()?.toJSON() ?? { state: this.status, items: [] };
  }
}

/**
 * A filtered view over a not-yet-ready lazy queryable. Reads delegate to the source
 * (triggering its load) and apply the predicate once data is available; until then the
 * view yields the same sentinel results as its source.
 */
class LazyQueryableView<T> implements Queryable<T> {
  readonly [QueryableTypeId] = true as const;
  private readonly source: Queryable<T>;
  private readonly predicate: Predicate<T>;

  constructor(source: Queryable<T>, predicate: Predicate<T>) {
    this.source = source;
    this.predicate = predicate;
  }

  get state(): QueryableState {
    return this.source.state;
  }

  private materialize(): Queryable<T> | undefined {
    if (this.source.state === "ready") {
      return this.source.where(this.predicate);
    }
    // Sentinel path: still touch the source so an `idle` source starts loading.
    void this.source.count();
    return undefined;
  }

  some(predicate?: Predicate<T>, thisArg?: unknown): boolean {
    return this.materialize()?.some(predicate, thisArg) ?? false;
  }

  where(predicate: Predicate<T>): Queryable<T> {
    if (this.source.state === "ready") {
      return this.source.where(this.predicate).where(predicate);
    }
    return new LazyQueryableView(this, predicate);
  }

  count(): number {
    return this.materialize()?.count() ?? 0;
  }

  first(): T | undefined {
    return this.materialize()?.first();
  }

  toReadonlyArray(): ReadonlyArray<T> {
    return this.materialize()?.toReadonlyArray() ?? [];
  }

  toJSON(): SerializableQueryable<T> {
    return { state: this.state, items: this.toReadonlyArray() };
  }
}

export function createLazyQueryable<T>(
  load: LazyQueryableLoad<T>,
  options?: LazyQueryableOptions,
): Queryable<T> {
  return new LazyQueryable(load, options);
}
