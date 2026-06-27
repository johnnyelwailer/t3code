import type * as React from "react";

type BaseProps = {
  readonly children?: React.ReactNode;
  readonly className?: string;
  readonly render?: unknown;
  readonly [key: string]: unknown;
};

declare module "@base-ui/react/select" {
  export namespace Select {
    interface RootProps<TValue extends string = string> extends BaseProps {
      readonly value?: TValue | null;
      readonly defaultValue?: TValue | null;
      readonly onValueChange?: (value: TValue | null) => void;
      readonly open?: boolean;
      readonly defaultOpen?: boolean;
      readonly onOpenChange?: (open: boolean) => void;
      readonly disabled?: boolean;
      readonly required?: boolean;
      readonly modal?: boolean;
      readonly name?: string;
      readonly items?: readonly unknown[];
    }

    const Root: <TValue extends string = string>(
      props: RootProps<TValue>,
    ) => React.ReactElement | null;

    namespace Trigger {
      interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement>, BaseProps {}
    }
    const Trigger: React.ComponentType<Trigger.Props>;

    namespace Icon {
      interface Props extends React.HTMLAttributes<HTMLElement>, BaseProps {}
    }
    const Icon: React.ComponentType<Icon.Props>;

    namespace Value {
      interface Props extends React.HTMLAttributes<HTMLElement>, BaseProps {}
    }
    const Value: React.ComponentType<Value.Props>;

    namespace Popup {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {}
    }
    const Popup: React.ComponentType<Popup.Props>;

    namespace Portal {
      interface Props extends BaseProps {}
    }
    const Portal: React.ComponentType<Portal.Props>;

    namespace Positioner {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {
        readonly side?: "top" | "right" | "bottom" | "left" | "inline-start" | "inline-end";
        readonly sideOffset?: number;
        readonly align?: "start" | "center" | "end";
        readonly alignOffset?: number;
        readonly alignItemWithTrigger?: boolean;
        readonly anchor?: unknown;
      }
    }
    const Positioner: React.ComponentType<Positioner.Props>;

    namespace ScrollUpArrow {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {}
    }
    const ScrollUpArrow: React.ComponentType<ScrollUpArrow.Props>;

    namespace ScrollDownArrow {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {}
    }
    const ScrollDownArrow: React.ComponentType<ScrollDownArrow.Props>;

    namespace List {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {}
    }
    const List: React.ComponentType<List.Props>;

    namespace Item {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {
        readonly value?: string;
        readonly disabled?: boolean;
      }
    }
    const Item: React.ComponentType<Item.Props>;

    namespace ItemIndicator {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {}
    }
    const ItemIndicator: React.ComponentType<ItemIndicator.Props>;

    namespace ItemText {
      interface Props extends React.HTMLAttributes<HTMLSpanElement>, BaseProps {}
    }
    const ItemText: React.ComponentType<ItemText.Props>;

    namespace Separator {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {}
    }
    const Separator: React.ComponentType<Separator.Props>;

    namespace Group {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {}
    }
    const Group: React.ComponentType<Group.Props>;

    namespace GroupLabel {
      interface Props extends React.HTMLAttributes<HTMLDivElement>, BaseProps {}
    }
    const GroupLabel: React.ComponentType<GroupLabel.Props>;
  }
}
