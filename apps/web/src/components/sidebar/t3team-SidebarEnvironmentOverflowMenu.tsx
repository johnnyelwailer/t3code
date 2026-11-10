import { EyeOffIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import type { EnvironmentFilterPill } from "@t3tools/client-runtime/t3team-environmentFilter";

import { cn } from "~/lib/utils";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import {
  ENVIRONMENT_FILTER_PILL_BASE,
  ENVIRONMENT_FILTER_PILL_UNSELECTED,
} from "./t3team-SidebarEnvironmentFilterPill";

type Props = {
  readonly overflow: ReadonlyArray<EnvironmentFilterPill>;
  readonly hiddenPills: ReadonlyArray<EnvironmentFilterPill>;
  readonly onSelect: (environmentId: string | null) => void;
  readonly onUnhide: (environmentId: string) => void;
  readonly onEnvironmentContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    pill: EnvironmentFilterPill,
  ) => void;
  readonly isPrimaryEnvironment: (environmentId: string) => boolean;
};

/**
 * The environment row's last control: "+N" while anything sits behind it. It lists the pills that
 * did not fit (select one to filter to it) and the ones the reader hid (a click brings one back),
 * and every environment offers its device menu on a right-click.
 */
export function T3TeamSidebarEnvironmentOverflowMenu({
  overflow,
  hiddenPills,
  onSelect,
  onUnhide,
  onEnvironmentContextMenu,
  isPrimaryEnvironment,
}: Props) {
  const count = overflow.length + hiddenPills.length;
  const deviceMenu =
    (pill: EnvironmentFilterPill) =>
    (event: ReactMouseEvent<HTMLElement>): void => {
      if (pill.id !== null && !isPrimaryEnvironment(pill.id)) {
        onEnvironmentContextMenu(event, pill);
      }
    };
  return (
    <Menu>
      <MenuTrigger
        aria-label={`${count} more environment${count === 1 ? "" : "s"}`}
        render={
          <button
            type="button"
            className={cn(
              ENVIRONMENT_FILTER_PILL_BASE,
              ENVIRONMENT_FILTER_PILL_UNSELECTED,
              "shrink-0 cursor-pointer text-muted-foreground",
            )}
          />
        }
      >
        +{count}
      </MenuTrigger>
      <MenuPopup align="start" sideOffset={4} className="w-56">
        {overflow.length > 0 ? (
          <MenuGroup>
            {overflow.map((pill) => (
              <MenuItem
                key={pill.id ?? "all"}
                onClick={() => onSelect(pill.id)}
                onContextMenu={pill.id === null ? undefined : deviceMenu(pill)}
              >
                <span className="truncate">{pill.label}</span>
              </MenuItem>
            ))}
          </MenuGroup>
        ) : null}
        {overflow.length > 0 && hiddenPills.length > 0 ? <MenuSeparator /> : null}
        {hiddenPills.length > 0 ? (
          <MenuGroup>
            <MenuGroupLabel>Hidden</MenuGroupLabel>
            {hiddenPills.map((pill) => (
              <MenuItem
                key={pill.id ?? "hidden"}
                onClick={() => pill.id !== null && onUnhide(pill.id)}
                onContextMenu={pill.id === null ? undefined : deviceMenu(pill)}
              >
                <EyeOffIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="truncate">{pill.label}</span>
              </MenuItem>
            ))}
          </MenuGroup>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}
