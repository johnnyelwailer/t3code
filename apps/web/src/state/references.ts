import { createReferenceEnvironmentAtoms } from "@t3tools/client-runtime/state/references";

import { connectionAtomRuntime } from "../connection/runtime";

export const referenceEnvironment = createReferenceEnvironmentAtoms(connectionAtomRuntime);
