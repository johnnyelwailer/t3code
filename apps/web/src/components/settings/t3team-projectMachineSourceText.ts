import type { ProjectMachineSourceReadout } from "@t3tools/contracts";

/** Where the machine definition is read from, in words: `acme/tools · branch setup`. */
export function describeMachineSource(readout: ProjectMachineSourceReadout | undefined): string {
  if (readout === undefined)
    return "This project has no repository to read a machine definition from.";
  const where = readout.branch === null ? "default branch" : `branch ${readout.branch}`;
  const own = readout.override === null || readout.override.repository === undefined;
  return `${readout.repository} · ${where}${own ? " (this project's repository)" : ""}`;
}

/** The saved choice as the form fields hold it (`owner/repo` or URL; empty = default). */
export function machineSourceFormValues(readout: ProjectMachineSourceReadout | undefined) {
  return {
    repository: readout?.override?.repository ?? "",
    branch: readout?.override?.branch ?? "",
  };
}

/** What the form saves: empty fields stay out, both empty is the default (null). */
export function machineSourceFromForm(form: { repository: string; branch: string }) {
  const repository = form.repository.trim();
  const branch = form.branch.trim();
  return repository === "" && branch === ""
    ? null
    : {
        ...(repository === "" ? {} : { repository }),
        ...(branch === "" ? {} : { branch }),
      };
}
