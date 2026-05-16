/**
 * `@almadar/sdk` — embed agent-generated orbital schemas in your React app
 * and call the Almadar agent from your server. See `docs/Almadar_Studio_SDK.md`
 * for the full integration guide.
 *
 * Subpath imports for environment-specific entry points:
 *   - `@almadar/sdk/react`  : `<AlmadarApp />`, `useOrbBus()` (browser/SSR)
 *   - `@almadar/sdk/client` : `AlmadarClient`, error classes (server / Node)
 *
 * The root `@almadar/sdk` barrel re-exports both for ergonomic single-import
 * consumers; tree-shaking will drop the unused half.
 */

export { AlmadarApp } from './react/AlmadarApp';
export { useOrbBus } from './react/useOrbBus';
export { AlmadarClient } from './client/AlmadarClient';
export {
  AlmadarError,
  ApiKeyError,
  RateLimitedError,
  CatalogOutOfScopeError,
  ServerError,
} from './client/errors';
export type {
  AgentEvent,
  AlmadarAppProps,
  AlmadarAppRef,
  AlmadarClientOptions,
  ApiErrorBody,
  AsyncJobHandle,
  CompileOptions,
  CompileResult,
  EditSchemaPatch,
  EntityData,
  EventPayload,
  GenerateOptions,
  GenerateResult,
  JsonValue,
  OrbitalSchema,
} from './types';
