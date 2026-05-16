/**
 * Typed SDK errors. Server emits a structured `ApiErrorBody`; the HTTP layer
 * maps the `code` to one of these subclasses. Customers `catch` by class.
 */

import type { ApiErrorBody } from '../types';

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

export function errorFromBody(body: ApiErrorBody): AlmadarError {
  switch (body.code) {
    case 4001:
      return new ApiKeyError(body);
    case 4029:
      return new RateLimitedError(body);
    case 4040:
      return new CatalogOutOfScopeError(body);
    default:
      return new ServerError(body);
  }
}
