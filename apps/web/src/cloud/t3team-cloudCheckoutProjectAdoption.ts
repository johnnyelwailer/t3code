/**
 * The shared pure rule: a cloud session's checkout joins the user's own project of the same
 * repository. Web's sidebar, settings, command palette and new-thread picker run the project list
 * through `useCloudAdoptedProjects`; the phone's selectors use the same function. The logic lives
 * in client-runtime (`t3team-cloudCheckoutAdoption.ts`) so both surfaces adopt identically.
 */
export { adoptCloudCheckoutProjects } from "@t3tools/client-runtime/state/t3team-cloudCheckoutAdoption";
