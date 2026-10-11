/**
 * Source embedded in the generated My Work maintain workflow: a stable signature of the digest
 * (sorted ticket ids). The workflow loader binds no imports, so this ships as self-contained JS.
 */
export const DIGEST_TICKET_SIGNATURE_SOURCE = `function digestTicketSignature(digest) {
  const ids = [];
  const projects = digest && typeof digest === "object" ? digest.projects : undefined;
  if (!Array.isArray(projects)) return "";
  for (const project of projects) {
    const tickets = project && typeof project === "object" ? project.tickets : undefined;
    if (!Array.isArray(tickets)) continue;
    for (const ticket of tickets) {
      const id = ticket && typeof ticket === "object" ? ticket.id : undefined;
      if (typeof id === "string" && id.length > 0) ids.push(id);
    }
  }
  ids.sort();
  return ids.join("\\n");
}`;
