/**
 * Public SDK types. Canonical schema / payload types come from `@almadar/core`;
 * the SDK adds the HTTP-layer option shapes and re-exports the canonical SSE
 * event union.
 */

import type { EntityData, EventPayload, OrbitalSchema, SSEEvent } from '@almadar/core';

export type { EntityData, EventPayload, OrbitalSchema, SSEEvent };

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
  /** Streaming callback for canonical SSE events. */
  onEvent?: (event: SSEEvent) => void;
  /**
   * When true, server responds with an `AsyncJobHandle` immediately and the
   * client polls. Useful for generations expected to exceed proxy SSE timeouts.
   */
  async?: boolean;
  /**
   * Agent provider override (e.g. 'deepseek', 'openai').
   * Omit to use the server's default.
   */
  provider?: string;
  /**
   * Agent model override (e.g. 'deepseek-chat').
   * Omit to use the server's default.
   */
  model?: string;
  /**
   * Behavior catalog mode — 'subset' narrows generation to stdAllowList.
   * Server-specific; omit if the agent does not support it.
   */
  catalogMode?: string;
  /**
   * Allow-list of std behavior names. Requires a server that supports catalog
   * narrowing (e.g. the builder Rabit/Studio agent).
   */
  stdAllowList?: string[];
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
}
