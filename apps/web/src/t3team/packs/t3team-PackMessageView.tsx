/**
 * Renders one pack `message.view`: the pack's component inside its pack scope and its own error
 * boundary, so a crashing pack view replaces itself with a one-line notice and never takes the
 * timeline down.
 */
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { MessageViewProps, MessageViewRegistration } from "@t3team/pack-ui/contract";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { ComponentType } from "react";

import { RenderErrorBoundary } from "~/components/RenderErrorBoundary";

import { PackScopeContext } from "./t3team-packScope";
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
    <PackScopeContext.Provider value={props.packId}>
      <RenderErrorBoundary
        resetKeys={[props.props]}
        fallback={
          <p className="text-xs text-muted-foreground">
            This view ({props.viewId}) could not be shown.
          </p>
        }
      >
        <View threadRef={context.threadRef} messageId={context.messageId} props={props.props} />
      </RenderErrorBoundary>
    </PackScopeContext.Provider>
  );
}

/** The registry `bind` of a pack registration: decode with its schema, render its component. */
export function bindPackMessageView<P>(
  packId: string,
  registration: MessageViewRegistration<P>,
): MessageViewEntry<PackViewContext>["bind"] {
  const decode = Schema.decodeUnknownOption(registration.props);
  return (raw) =>
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
}
