import * as Layer from "effect/Layer";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { T3TeamAskUserWriter } from "./t3team-askUserWriter.ts";

/**
 * The services `T3TeamToolkitRegistrationLive` still asks for beyond the broker, since upstream's
 * `toolkitRegistration` stopped hiding the tools' declared dependencies. Tests that register the
 * toolkit but never reach a handler using them provide these unimplemented mocks.
 */
export const T3TeamToolkitRegistrationDepsTest = Layer.mergeAll(
  Layer.mock(ThreadManagementService.ThreadManagementService)({}),
  Layer.mock(T3TeamAskUserWriter)({}),
);
