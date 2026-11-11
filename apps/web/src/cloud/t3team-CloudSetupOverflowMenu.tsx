/**
 * The "⋯" the setup card and the composer banner put everything but their one primary action
 * behind, so a waiting message never shows a row of equally loud buttons.
 */
import { EllipsisIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";

export interface CloudSetupOverflowItem {
  readonly id: string;
  readonly label: string;
  readonly onClick?: (() => void) | undefined;
  /** An external page instead of an action (the provider's run log). */
  readonly href?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export function CloudSetupOverflowMenu({
  items,
}: {
  readonly items: ReadonlyArray<CloudSetupOverflowItem>;
}) {
  if (items.length === 0) return null;
  return (
    <Menu>
      <MenuTrigger
        render={<Button type="button" variant="ghost-muted" size="icon-xs" />}
        aria-label="More options"
        data-cloud-setup-overflow=""
      >
        <EllipsisIcon aria-hidden />
      </MenuTrigger>
      <MenuPopup align="start" side="bottom" className="min-w-52">
        {items.map((item) =>
          item.href === undefined ? (
            <MenuItem key={item.id} disabled={item.disabled} onClick={item.onClick}>
              {item.label}
            </MenuItem>
          ) : (
            <MenuItem
              key={item.id}
              render={<a href={item.href} target="_blank" rel="noreferrer" />}
            >
              {item.label}
            </MenuItem>
          ),
        )}
      </MenuPopup>
    </Menu>
  );
}
