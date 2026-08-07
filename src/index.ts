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
  PinError,
  AsyncUnsupportedError,
  GenerationFailedError,
  ServerError,
  streamErrorFromEvent,
} from './client/errors';
export {
  CATALOG_MODES,
  API_ERROR_CODES,
  STREAM_ERROR_CODES,
  isGenerateMeta,
} from './types';
export type {
  AlmadarAppProps,
  AlmadarClientOptions,
  ApiErrorBody,
  ApiErrorCode,
  CatalogMode,
  CompileOptions,
  CompileResult,
  EditSchemaPatch,
  EntityData,
  EventPayload,
  GenerateMeta,
  GenerateMetaOrganism,
  GenerateOptions,
  GeneratePin,
  GenerateResult,
  GenerateStreamEvent,
  GenerationMetaEvent,
  GenerationTier,
  OrbitalSchema,
  SSEEvent,
  StreamErrorCode,
} from './types';
