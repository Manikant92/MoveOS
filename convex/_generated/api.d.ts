/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as location from "../location.js";
import type * as migrations from "../migrations.js";
import type * as operations from "../operations.js";
import type * as reminders from "../reminders.js";
import type * as researchModel from "../researchModel.js";
import type * as researchQueue from "../researchQueue.js";
import type * as workflowRules from "../workflowRules.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  http: typeof http;
  integrations: typeof integrations;
  location: typeof location;
  migrations: typeof migrations;
  operations: typeof operations;
  reminders: typeof reminders;
  researchModel: typeof researchModel;
  researchQueue: typeof researchQueue;
  workflowRules: typeof workflowRules;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
