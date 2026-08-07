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
 * 4001 → ApiKeyError, 4029 → RateLimitedError, 4040 → CatalogOutOfScopeError,
 * 4041-4045 → PinError, 4060 → AsyncUnsupportedError, 5001 → GenerationFailedError.
 * See `API_ERROR_CODES` for the full code table.
 */
export interface ApiErrorBody {
  code: number;
  message: string;
  details?: EventPayload;
}

export const CATALOG_MODES = ['extend', 'subset', 'replace'] as const;
export type CatalogMode = (typeof CATALOG_MODES)[number];

/**
 * Pin generation to a specific organism (and, when the organism has more than
 * one factory orbital, the orbital to use). `knobs` fills factory config.
 */
export interface GeneratePin {
  organism: string;
  /** Required iff the organism has more than one orbital. */
  orbital?: string;
  appName?: string;
  knobs?: Record<string, string | number | boolean>;
}

/** Which cache tier served the generation — L1 confirmed factory HIT, HIT-fail demote, or free-compose MISS. */
export type GenerationTier = 'confirmed' | 'hit' | 'miss';

export interface GenerateMetaOrganism {
  name: string;
  source: 'factory' | 'free-lolo';
}

export interface GenerateMeta {
  tier: GenerationTier;
  organisms: GenerateMetaOrganism[];
  /** Organism names that HIT-failed and were demoted to free-compose. */
  demoted: string[];
  cacheVerdict: { verdict: 'hit' | 'miss'; chosen: string | null } | null;
  durationMs: number;
}

export interface GenerationMetaEvent {
  type: 'generation_meta';
  data: GenerateMeta;
  timestamp: number;
}

/** Canonical SSE events plus the SDK-only `generation_meta` summary event. */
export type GenerateStreamEvent = SSEEvent | GenerationMetaEvent;

function isGenerateMetaOrganism(value: unknown): value is GenerateMetaOrganism {
  if (value === null || typeof value !== 'object') return false;
  const v = value as { name?: unknown; source?: unknown };
  if (typeof v.name !== 'string') return false;
  return v.source === 'factory' || v.source === 'free-lolo';
}

function isGenerateMetaCacheVerdict(value: unknown): value is GenerateMeta['cacheVerdict'] {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const v = value as { verdict?: unknown; chosen?: unknown };
  if (v.verdict !== 'hit' && v.verdict !== 'miss') return false;
  return v.chosen === null || typeof v.chosen === 'string';
}

/** Runtime guard for the `generation_meta` SSE payload — the zero-cast bridge from JSON. */
export function isGenerateMeta(value: unknown): value is GenerateMeta {
  if (value === null || typeof value !== 'object') return false;
  const v = value as {
    tier?: unknown;
    organisms?: unknown;
    demoted?: unknown;
    cacheVerdict?: unknown;
    durationMs?: unknown;
  };
  if (v.tier !== 'confirmed' && v.tier !== 'hit' && v.tier !== 'miss') return false;
  if (!Array.isArray(v.organisms) || !v.organisms.every(isGenerateMetaOrganism)) return false;
  if (!Array.isArray(v.demoted) || !v.demoted.every((d) => typeof d === 'string')) return false;
  if (!isGenerateMetaCacheVerdict(v.cacheVerdict)) return false;
  return typeof v.durationMs === 'number';
}

export const API_ERROR_CODES = {
  INVALID_REQUEST: 4000,
  API_KEY: 4001,
  ORIGIN_FORBIDDEN: 4003,
  EDIT_CONFIRM_REQUIRED: 4009,
  RATE_LIMITED: 4029,
  CATALOG_OUT_OF_SCOPE: 4040,
  PIN_UNKNOWN_ORGANISM: 4041,
  PIN_OUT_OF_SCOPE: 4042,
  PIN_CONFLICT: 4043,
  PIN_UNKNOWN_KNOB: 4044,
  PIN_ORBITAL_REQUIRED: 4045,
  ASYNC_UNSUPPORTED: 4060,
  FOCUS_STALE: 4090,
  SERVER: 5000,
  GENERATION_FAILED: 5001,
  RUNTIME: 5002,
  WORKSPACE_OPEN: 5003,
  AI_UNCONFIGURED: 5030,
} as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/** `error` event `code` values on the generate SSE stream. */
export const STREAM_ERROR_CODES = ['failed', 'runtime', 'workspace_open', 'ai_unconfigured', 'focus_stale'] as const;
export type StreamErrorCode = (typeof STREAM_ERROR_CODES)[number];

export interface GenerateOptions {
  prompt: string;
  endUserId?: string;
  appId?: string;
  /** Streaming callback for canonical SSE events plus the SDK's `generation_meta` summary. */
  onEvent?: (event: GenerateStreamEvent) => void;
  /**
   * The client has no async job surface: passing `true` throws
   * `AsyncUnsupportedError` (code 4060) before any network call is made.
   * For long-running generations use the default streaming mode with `onEvent`.
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
  catalogMode?: CatalogMode;
  /**
   * Allow-list of std behavior names. Requires a server that supports catalog
   * narrowing (e.g. the builder Rabit/Studio agent).
   */
  stdAllowList?: string[];
  /** Pin generation to a specific organism/orbital instead of free-composing. */
  pin?: GeneratePin;
}

export interface GenerateResult {
  schema: OrbitalSchema;
  appId?: string;
  /** Absent for third-party servers built with `createGenerateHandler` that don't emit `generation_meta`. */
  meta?: GenerateMeta;
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
  /**
   * Tiers of config knobs to surface as auto-derived controls. When provided,
   * a control rail is rendered next to the app. Omit to hide controls.
   * Common values: `['presentation']`, `['presentation', 'domain']`.
   */
  exposedTiers?: string[];
  /** Where to render the auto-derived controls rail. Default: 'right'. */
  controlsPosition?: 'right' | 'bottom';
  /**
   * Explicit override for whether the config-controls rail renders. When
   * omitted, falls back to legacy behavior: `exposedTiers` non-empty and
   * `mode !== 'server'`.
   */
  showControls?: boolean;
}

/**
 * Props for `<OrbitalConfigPanel />` — low-level control rail used by
 * `<AlmadarApp />` when `exposedTiers` is set.
 */
export interface OrbitalConfigPanelProps {
  schema: string | OrbitalSchema;
  exposedTiers?: string[];
  position?: 'right' | 'bottom';
  onSchemaChange?: (schema: OrbitalSchema) => void;
}
