/**
 * Renders one pack `message.view`: the pack's component in a `ViewInstance` (its pack scope and its
 * own error boundary), so a crashing pack view replaces itself with a one-line notice and never
 * takes the timeline down.
 */
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { MessageViewProps, MessageViewRegistration } from "@t3team/pack-ui/contract";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { ComponentType } from "react";

import { ViewInstance } from "./t3team-ViewInstance";
import type { MessageViewEntry } from "./t3team-viewRegistry";

/** What a pack view gets from the timeline row it renders in. */
export interface PackViewContext {
  readonly threadRef: ScopedThreadRef | null;
  readonly messageId: string;
}

function PackMessageView<P>(props: {
  readonly packId: string;
  readonly viewId: string;
  readonly component: ComponentType<MessageViewProps<P>>;
  readonly props: P;
  readonly context: PackViewContext;
}) {
  const { component: View, context } = props;
  return (
    <ViewInstance
      owner={{ kind: "pack", packId: props.packId }}
      resetKeys={[props.props]}
      fallback={
        <p className="text-xs text-muted-foreground">
          This view ({props.viewId}) could not be shown.
        </p>
      }
    >
      <View threadRef={context.threadRef} messageId={context.messageId} props={props.props} />
    </ViewInstance>
  );
}

/** The registry `bind` of a pack registration: decode with its schema, render its component. */
export function bindPackMessageView<P>(
  packId: string,
  registration: MessageViewRegistration<P>,
): MessageViewEntry<PackViewContext>["bind"] {
  const decode = Schema.decodeUnknownOption(registration.props);
  const bindDecoded = (raw: unknown) =>
    Option.match(decode(raw), {
      onNone: () => null,
      onSome: (value) => (context: PackViewContext) => (
        <PackMessageView
          packId={packId}
          viewId={registration.id}
          component={registration.component}
          props={value}
          context={context}
        />
      ),
    });
  // One decode per attachment props object. The timeline asks about a row several times per
  // render, and an unchanged artifact keeps its props object; a fresh decode each time would hand
  // the view new props on every unrelated update and reset its error boundary (`resetKeys`).
  const bound = new WeakMap<object, ReturnType<typeof bindDecoded>>();
  return (raw) => {
    if (typeof raw !== "object" || raw === null) return bindDecoded(raw);
    const cached = bound.get(raw);
    if (cached !== undefined) return cached;
    const result = bindDecoded(raw);
    bound.set(raw, result);
    return result;
  };
}
