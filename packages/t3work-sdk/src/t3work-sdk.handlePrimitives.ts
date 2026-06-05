/**
 * The capability-gated Handle globals bound into the workflow body (Epic 25.4 §Part 2):
 * `ui.show`, `thread.send`, `child.spawn`, `user.ask`, `user.notify`. Each returns a typed
 * {@link Handle} (or {@link UiHandle}) and routes its `sent`/`resolved` journaling through
 * the durable runtime's {@link HandleDispatch}, firing the side effect via the host
 * {@link MessageBroker}.
 *
 * This is the first real exercise of `meta.capabilities` (Epic 25 §Capability gating): a
 * primitive whose engine-feature string ("ui" / "thread" / "child" / "user") is NOT in the
 * declared capability set is bound to a thrower that raises {@link PermissionDeniedError} at
 * the call site, rather than being live. The unconditionally-bound 25.3 primitives are
 * untouched.
 */

import type * as Schema from "effect/Schema";

import type { MessageBroker, ThreadTargetWire } from "./t3work-sdk.broker.ts";
import { PermissionDeniedError, TargetMissingError } from "./t3work-sdk.errors.ts";
import {
  type Handle,
  type HandleDispatch,
  makeHandle,
  type UiHandle,
} from "./t3work-sdk.handles.ts";
import { decodeWithSchema } from "./t3work-sdk.internal.ts";

/** A thread reference — `thread.parent` / `thread.byId(id)`. */
export interface ThreadRef {
  readonly kind: "thread-ref";
  readonly id?: string;
  readonly ref?: "parent";
}
/** `thread.send`'s first argument: a {@link ThreadRef}, a child {@link Handle}, or `"self"`. */
export type ThreadTarget = ThreadRef | { readonly id: string } | "self";

interface ResponseOpt {
  readonly responseSchema?: Schema.Schema<unknown> | undefined;
}
export interface ThreadSendOpts extends ResponseOpt {}
export interface ChildSpawnOpts extends ResponseOpt {
  readonly name?: string;
  readonly kickoffPrompt?: string;
}
export interface UserAskOpts {
  readonly title?: string;
  readonly responseSchema: Schema.Schema<unknown>;
}
export interface UiView extends ResponseOpt {
  readonly [key: string]: unknown;
}

export interface WorkflowHandlePrimitives {
  readonly ui: { show: (view: UiView) => Promise<UiHandle<unknown>> };
  readonly thread: {
    send: (target: ThreadTarget, payload: unknown, opts?: ThreadSendOpts) => Promise<Handle<unknown>>;
    readonly parent: ThreadRef;
    byId: (id: string) => ThreadRef;
  };
  readonly child: { spawn: (opts: ChildSpawnOpts) => Promise<Handle<unknown>> };
  readonly user: {
    ask: (opts: UserAskOpts) => Promise<Handle<unknown>>;
    notify: (message: unknown) => Promise<Handle<never>>;
  };
}

/** Drop `responseSchema` (a Schema is not canonical JSON) so a payload/view can be hashed
 * into the `sent` entry and handed to the broker. */
function renderable(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (key !== "responseSchema") out[key] = val;
  }
  return out;
}

/** An ungated primitive: throws {@link PermissionDeniedError} at the call site. */
function denied(cap: string, primitive: string): () => never {
  return () => {
    throw new PermissionDeniedError(
      `'${primitive}' requires the '${cap}' capability. Add '${cap}' to this workflow's meta.capabilities.`,
    );
  };
}

function resolveTarget(target: ThreadTarget): ThreadTargetWire {
  if (target === "self") return { kind: "self" };
  if ((target as ThreadRef).kind === "thread-ref") {
    const ref = target as ThreadRef;
    if (ref.ref === "parent") return { kind: "parent" };
    if (ref.id !== undefined) return { kind: "thread", id: ref.id };
    throw new TargetMissingError("thread.send received a thread-ref with no id.");
  }
  const id = (target as { readonly id?: unknown }).id;
  if (typeof id === "string") return { kind: "child", id };
  throw new TargetMissingError(
    "thread.send target must be 'self', a ThreadRef (thread.parent / thread.byId), or a child handle.",
  );
}

export function createHandlePrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
}): WorkflowHandlePrimitives {
  const { dispatch, broker } = deps;

  const fire = async (params: {
    readonly kind: "ui.show" | "thread.send" | "child.spawn" | "user.ask" | "user.notify";
    readonly args: unknown;
    readonly payload: unknown;
    readonly target?: ThreadTargetWire;
    readonly responseSchema?: Schema.Schema<unknown> | undefined;
    readonly update?: (view: unknown) => Promise<void>;
  }): Promise<Handle<unknown>> => {
    const ask = params.responseSchema !== undefined;
    const correlationId = await dispatch.send({
      kind: params.kind,
      refId: params.kind,
      args: params.args,
      fire: (cid, resolver) =>
        broker.send(
          {
            correlationId: cid,
            kind: params.kind,
            payload: params.payload,
            ...(params.target === undefined ? {} : { target: params.target }),
            ...(params.responseSchema === undefined ? {} : { responseSchema: params.responseSchema }),
          },
          resolver,
        ),
    });
    const schema = params.responseSchema;
    return makeHandle(dispatch, correlationId, {
      kind: params.kind,
      refId: params.kind,
      ask,
      ...(schema === undefined
        ? {}
        : { decodeReply: (reply: unknown) => decodeWithSchema(schema, reply, "Invalid handle response") }),
      ...(params.update === undefined ? {} : { update: params.update }),
    });
  };

  const uiShow = (view: UiView): Promise<UiHandle<unknown>> => {
    const rendered = renderable(view);
    return fire({
      kind: "ui.show",
      args: rendered,
      payload: rendered,
      responseSchema: view.responseSchema,
      update: (next) =>
        fire({ kind: "ui.show", args: renderable(next), payload: renderable(next) }).then(() => undefined),
    }) as Promise<UiHandle<unknown>>;
  };

  const threadSend = (target: ThreadTarget, payload: unknown, opts?: ThreadSendOpts) => {
    const wire = resolveTarget(target);
    return fire({
      kind: "thread.send",
      args: { target: wire, payload: renderable(payload) },
      payload,
      target: wire,
      responseSchema: opts?.responseSchema,
    });
  };

  const childSpawn = (opts: ChildSpawnOpts) =>
    fire({
      kind: "child.spawn",
      args: renderable(opts),
      payload: renderable(opts),
      responseSchema: opts.responseSchema,
    });

  const userAsk = (opts: UserAskOpts) =>
    fire({
      kind: "user.ask",
      args: renderable(opts),
      payload: renderable(opts),
      responseSchema: opts.responseSchema,
    });

  const userNotify = (message: unknown) =>
    fire({ kind: "user.notify", args: renderable(message), payload: message }) as Promise<Handle<never>>;

  const has = (cap: string): boolean => deps.capabilities.has(cap);

  return {
    ui: { show: has("ui") ? uiShow : (denied("ui", "ui.show") as unknown as typeof uiShow) },
    thread: {
      send: has("thread") ? threadSend : (denied("thread", "thread.send") as unknown as typeof threadSend),
      parent: { kind: "thread-ref", ref: "parent" },
      byId: (id: string): ThreadRef => ({ kind: "thread-ref", id }),
    },
    child: {
      spawn: has("child") ? childSpawn : (denied("child", "child.spawn") as unknown as typeof childSpawn),
    },
    user: {
      ask: has("user") ? userAsk : (denied("user", "user.ask") as unknown as typeof userAsk),
      notify: has("user") ? userNotify : (denied("user", "user.notify") as unknown as typeof userNotify),
    },
  };
}
