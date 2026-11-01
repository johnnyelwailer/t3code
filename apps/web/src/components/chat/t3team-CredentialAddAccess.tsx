/** The "add access" action on a gh sign-in that lacks a scope: the button, then the code and page to approve it on. */
import { addAccessLabel } from "@t3tools/client-runtime/t3team-credentialSourceOptions";

import { Button } from "../ui/button";
import type { CredentialRefreshView } from "./t3team-useCredentialRefresh";

export function T3TeamCredentialAddAccess(props: {
  readonly view: CredentialRefreshView;
  readonly host: string;
  readonly scopes: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly onStart: (host: string, scopes: ReadonlyArray<string>) => void;
}) {
  const { view } = props;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {view.phase === "waiting" ? (
        <>
          <p className="text-xs text-muted-foreground">
            Open the page, enter this code and approve. This card updates when you have.
          </p>
          <span className="select-all font-mono text-lg tracking-widest text-foreground">
            {view.userCode}
          </span>
          <a
            href={view.verificationUri}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-xs text-primary underline"
          >
            {view.verificationUri}
          </a>
        </>
      ) : (
        <div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={props.disabled || view.phase === "starting"}
            onClick={() => props.onStart(props.host, props.scopes)}
          >
            {addAccessLabel(props.scopes)}
          </Button>
        </div>
      )}
      {view.phase === "failed" ? (
        <p role="alert" className="text-xs text-destructive">
          {view.message}
        </p>
      ) : null}
    </div>
  );
}
