import {
  useCreateProjectConnect,
  type CreateProjectConnect,
} from "~/t3team/hooks/t3team-useCreateProjectConnect";
import { CalmError } from "~/t3team/t3team-CalmError";
import { ConnectAtlassianStep } from "~/t3team/t3team-ConnectAtlassianStep";
import { CreateProjectDialogOAuthNotice } from "~/t3team/t3team-CreateProjectDialogOAuthNotice";

/** What the choose screen shows while no Jira site is connected: sign in, then the list appears. */
export function CreateProjectConnectView({
  connect,
  initialShowTokenForm,
}: {
  connect: CreateProjectConnect;
  /** Storybook hook: start on the revealed API-token form. */
  initialShowTokenForm?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
      <CreateProjectDialogOAuthNotice oauth={connect.oauth} />
      {connect.error ? <CalmError compact error={connect.error} action="connecting Jira" /> : null}
      <ConnectAtlassianStep
        loading={false}
        oauthConfigured={connect.oauthConfigured}
        oauth={connect.oauth}
        siteUrl={connect.siteUrl}
        email={connect.email}
        apiToken={connect.apiToken}
        setSiteUrl={connect.setSiteUrl}
        setEmail={connect.setEmail}
        setApiToken={connect.setApiToken}
        canConnectBasic={connect.canConnectBasic}
        connectingBasic={connect.connecting}
        onConnectBasic={() => void connect.connectBasic()}
        {...(initialShowTokenForm ? { initialShowTokenForm } : {})}
      />
    </div>
  );
}

export function CreateProjectConnectPanel({
  refreshCatalog,
}: {
  refreshCatalog: () => Promise<void>;
}) {
  return <CreateProjectConnectView connect={useCreateProjectConnect(refreshCatalog)} />;
}
