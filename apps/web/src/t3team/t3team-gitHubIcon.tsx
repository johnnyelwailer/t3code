import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";

import type { Icon } from "~/components/Icons";
import { SourceControlIconArtwork } from "~/components/SourceControlIconArtwork";

const gitHubArtwork = sourceControlClients.get("github").icon;

/** GitHub's mark, drawn from its source-control definition (forge icons left Icons.tsx upstream). */
export const GitHubIcon: Icon = (props) =>
  gitHubArtwork === null ? null : <SourceControlIconArtwork {...props} icon={gitHubArtwork} />;
