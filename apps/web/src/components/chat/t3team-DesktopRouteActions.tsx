import { desktopRouteChoices, type DesktopRouteCard } from "@t3tools/contracts";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { Menu, MenuItem, MenuItemLabel, MenuPopup, MenuTrigger } from "../ui/menu";

/**
 * One "Approve" (once) with the wider scopes in a split menu beside it, then Deny. The menu is the
 * same Base UI menu the header split buttons use, so arrow keys, Enter and Escape work as there.
 */
export function T3TeamDesktopRouteActions(props: {
  readonly card: DesktopRouteCard;
  readonly disabled: boolean;
  readonly onAnswer: (label: string) => void;
}) {
  const { disabled, onAnswer } = props;
  const { primary, more, decline } = desktopRouteChoices(props.card);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary === null ? null : (
        <Group aria-label="Approve">
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => onAnswer(primary.label)}
            data-desktop-route-action={primary.scope}
          >
            {primary.text}
          </Button>
          {more.length === 0 ? null : (
            <>
              <GroupSeparator />
              <Menu>
                <MenuTrigger
                  disabled={disabled}
                  render={
                    <Button
                      size="icon-sm"
                      aria-label="More ways to approve"
                      data-desktop-route-more=""
                    />
                  }
                >
                  <ChevronDownIcon aria-hidden="true" className="size-4" />
                </MenuTrigger>
                <MenuPopup align="start">
                  {more.map((choice) => (
                    <MenuItem
                      key={choice.scope}
                      onClick={() => onAnswer(choice.label)}
                      data-desktop-route-action={choice.scope}
                    >
                      <MenuItemLabel>{choice.text}</MenuItemLabel>
                    </MenuItem>
                  ))}
                </MenuPopup>
              </Menu>
            </>
          )}
        </Group>
      )}
      {decline === null ? null : (
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onAnswer(decline)}
          data-desktop-route-action="decline"
        >
          Deny
        </Button>
      )}
    </div>
  );
}
