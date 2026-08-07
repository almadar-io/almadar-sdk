/**
 * Typed SDK errors. Server emits a structured `ApiErrorBody`; the HTTP layer
 * maps the `code` to one of these subclasses. Customers `catch` by class.
 */

import { API_ERROR_CODES, STREAM_ERROR_CODES } from '../types';
import type { ApiErrorBody, StreamErrorCode } from '../types';

export class AlmadarError extends Error {
  readonly code: number;
  readonly details?: ApiErrorBody['details'];
  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'AlmadarError';
    this.code = body.code;
    this.details = body.details;
  }
}

/** 4001 — invalid, revoked, or missing API key. */
export class ApiKeyError extends AlmadarError {
  constructor(body: ApiErrorBody) {
    super(body);
    this.name = 'ApiKeyError';
  }
}

/** 4029 — team cap (feature counter) exceeded. Retry after a billing cycle. */
export class RateLimitedError extends AlmadarError {
  readonly retryAfterSeconds?: number;
  constructor(body: ApiErrorBody, retryAfterSeconds?: number) {
    super(body);
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** 4040 — the team's behavior catalog (subset/replace mode) cannot serve the request. */
export class CatalogOutOfScopeError extends AlmadarError {
  constructor(body: ApiErrorBody) {
    super(body);
    this.name = 'CatalogOutOfScopeError';
  }
}

/** Anything else from the server with a recognized envelope but no specific subclass. */
export class ServerError extends AlmadarError {
  constructor(body: ApiErrorBody) {
    super(body);
    this.name = 'ServerError';
  }
}

/** 4041-4045 — pin resolution failed: unknown organism, out-of-scope, conflicting pins, unknown knob, or a missing required orbital. */
export class PinError extends AlmadarError {
  constructor(body: ApiErrorBody) {
    super(body);
    this.name = 'PinError';
  }
}

/** 4060 — `generate({ async: true })` has no server-side job surface; use the default streaming mode instead. */
export class AsyncUnsupportedError extends AlmadarError {
  constructor(body: ApiErrorBody) {
    super(body);
    this.name = 'AsyncUnsupportedError';
  }
}

/** 5001 — generation failed server-side. */
export class GenerationFailedError extends AlmadarError {
  constructor(body: ApiErrorBody) {
    super(body);
    this.name = 'GenerationFailedError';
  }
}

export function errorFromBody(body: ApiErrorBody): AlmadarError {
  switch (body.code) {
    case API_ERROR_CODES.API_KEY:
      return new ApiKeyError(body);
    case API_ERROR_CODES.RATE_LIMITED:
      return new RateLimitedError(body);
    case API_ERROR_CODES.CATALOG_OUT_OF_SCOPE:
      return new CatalogOutOfScopeError(body);
    case API_ERROR_CODES.PIN_UNKNOWN_ORGANISM:
    case API_ERROR_CODES.PIN_OUT_OF_SCOPE:
    case API_ERROR_CODES.PIN_CONFLICT:
    case API_ERROR_CODES.PIN_UNKNOWN_KNOB:
    case API_ERROR_CODES.PIN_ORBITAL_REQUIRED:
      return new PinError(body);
    case API_ERROR_CODES.ASYNC_UNSUPPORTED:
      return new AsyncUnsupportedError(body);
    case API_ERROR_CODES.GENERATION_FAILED:
      return new GenerationFailedError(body);
    default:
      return new ServerError(body);
  }
}

function isStreamErrorCode(code: string | undefined): code is StreamErrorCode {
  if (code === undefined) return false;
  return STREAM_ERROR_CODES.some((c) => c === code);
}

/** Maps a `generate` SSE `error` event's `{ error, code }` payload to a typed SDK error. */
export function streamErrorFromEvent(data: { error: string; code?: string }): AlmadarError {
  const message = data.error;
  if (!isStreamErrorCode(data.code)) {
    return new ServerError({ code: API_ERROR_CODES.SERVER, message });
  }
  switch (data.code) {
    case 'failed':
      return new GenerationFailedError({ code: API_ERROR_CODES.GENERATION_FAILED, message });
    case 'ai_unconfigured':
      return new ServerError({ code: API_ERROR_CODES.AI_UNCONFIGURED, message });
    case 'workspace_open':
      return new ServerError({ code: API_ERROR_CODES.WORKSPACE_OPEN, message });
    case 'focus_stale':
      return new ServerError({ code: API_ERROR_CODES.FOCUS_STALE, message });
    case 'runtime':
      return new ServerError({ code: API_ERROR_CODES.RUNTIME, message });
  }
}
