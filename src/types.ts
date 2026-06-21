/**
 * Public SDK types. Canonical schema / payload types come from `@almadar/core`;
 * the SDK adds the typed event union and HTTP-layer option shapes.
 */

import type { EntityData, EventPayload, OrbitalSchema } from '@almadar/core';

export type { EntityData, EventPayload, OrbitalSchema };

/**
 * Typed request envelope for `createGenerateHandler`.
 * Body shape: `{ prompt: string; endUserId?: string; appId?: string }`
 */
export interface GenerateRequest {
  prompt?: string;
  /** Alias accepted alongside `prompt`. */
  message?: string;
  endUserId?: string;
  appId?: string;
}

/**
 * Typed request envelope for `createEditHandler`.
 * Body shape: `{ appId: string; patch: EditSchemaPatch }`
 */
export interface EditSchemaRequest {
  appId?: string;
  patch?: EditSchemaPatch;
}

/**
 * Canonical JSON value type — the closure of every value that survives a
 * `JSON.parse(JSON.stringify(x))` round-trip. Used as the JSON-parse output
 * type so we never widen to `unknown` at HTTP boundaries.
 *
 * Mirrors `packages/almadar-agent/src/api-types.ts:25-31`.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Lifecycle events emitted by the agent during a `generate()` call. Mirrors
 * the SSE event types from
 * `apps/builder/packages/server/src/routes/agent/deepagent.ts` — keep in sync
 * when new events are added on the server.
 */
export type AgentEvent =
  | { type: 'start'; threadId: string; workDir: string }
  | { type: 'plan_committed'; orbitals: readonly string[] }
  | { type: 'orbital_added'; orbital: string }
  | { type: 'schema_update'; schema: OrbitalSchema }
  | { type: 'app_created'; appId: string; name: string }
  | { type: 'subagent_start'; subagent: string }
  | { type: 'subagent_progress'; subagent: string; message: string }
  | { type: 'subagent_complete'; subagent: string }
  | { type: 'coordinator_decision'; decision: string }
  | { type: 'complete'; schema: OrbitalSchema; appId?: string }
  | { type: 'error'; message: string; code?: number };

/**
 * Server-emitted error envelope. `code` maps to the SDK error subclasses:
 * 4001 → ApiKeyError, 4029 → RateLimitedError, 4040 → CatalogOutOfScopeError.
 */
export interface ApiErrorBody {
  code: number;
  message: string;
  details?: EventPayload;
}

/**
 * Async-mode (`generate({ async: true })`) server response. The client polls
 * `statusUrl` until the job resolves.
 */
export interface AsyncJobHandle {
  jobId: string;
  statusUrl: string;
}

export interface GenerateOptions {
  prompt: string;
  endUserId?: string;
  appId?: string;
  /** Streaming callback for SSE events. */
  onEvent?: (event: AgentEvent) => void;
  /**
   * When true, server responds with an `AsyncJobHandle` immediately and the
   * client polls. Useful for generations expected to exceed proxy SSE timeouts.
   */
  async?: boolean;
}

export interface GenerateResult {
  schema: OrbitalSchema;
  appId?: string;
}

/**
 * Body of a `PUT /api/v1/agent/edit-schema`. Strictly structural; the SDK
 * does not deep-type the patch — that's the server's job. Field types are
 * `EventPayload`-compatible so callers can't sneak in arbitrary objects.
 */
export interface EditSchemaPatch {
  orbital?: string;
  traitOverrides?: EventPayload;
  config?: EventPayload;
}

export interface CompileOptions {
  target?: 'express' | 'hono';
  shell?: 'typescript' | 'python' | 'mobile';
}

export interface CompileResult {
  downloadUrl: string;
  expiresAt: string;
}

export interface AlmadarClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Props for `<AlmadarApp />` — renders an orbital schema. The runtime mode
 * decides whether effects (persist/fetch/call-service) hit a backend or stay
 * mocked in-browser.
 */
export interface AlmadarAppProps {
  schema: OrbitalSchema;
  /**
   * - `static`: pure client-side, no server effects. Use with `data`.
   * - `mock` (default): in-browser fake server, faker-seeded if `data` is undefined.
   * - `server`: real backend at `serverUrl`.
   */
  mode?: 'static' | 'mock' | 'server';
  /** Seed data keyed by entity name (canonical `EntityData` shape). */
  data?: EntityData;
  /** Required when `mode === 'server'`. */
  serverUrl?: string;
  initialPagePath?: string;
  height?: string;
  className?: string;
  theme?: 'copper' | 'wireframe' | 'default';
}

export interface AlmadarAppRef {
  emit(eventName: string, payload?: EventPayload): void;
}
