/**
 * `@almadar/sdk/server/express` — Express adapter for the Almadar server handlers.
 *
 * Node-only. The consumer must provide their own `express` installation.
 * This module imports express TYPES only; it is never bundled with express itself.
 *
 * Usage:
 *   import { createGenerateHandler, createEditHandler } from '@almadar/sdk/server/express';
 *   app.post('/api/agent/generate', createGenerateHandler({ apiKey }));
 *   app.put('/api/agent/edit', createEditHandler({ apiKey }));
 */

import type { Request as ExpressRequest, Response as ExpressResponse, RequestHandler } from 'express';
import {
  createGenerateHandler as coreGenerateHandler,
  createEditHandler as coreEditHandler,
} from './index';

// ============================================================================
// Express-specific option surface
// ============================================================================

export interface GenerateHandlerOptions {
  /** API key issued from Studio's /settings/sdk panel. */
  apiKey: string;
  /** Defaults to https://studio.almadar.io. */
  baseUrl?: string;
  /**
   * Derive a stable end-user id from the Express request.
   * Falls back to the `x-user-id` request header when omitted.
   */
  endUserId?: (req: ExpressRequest) => string;
}

// ============================================================================
// Express↔Fetch bridge helpers
// ============================================================================

/**
 * Convert an Express `Request` to a Web-standard `Request`.
 * Re-serialises the already-parsed body so the core handler's `request.json()` succeeds.
 */
function expressReqToWebRequest(req: ExpressRequest): Request {
  const protocol = req.protocol;
  const host = req.get('host') ?? 'localhost';
  const url = `${protocol}://${host}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    }
  }
  const bodyJson = JSON.stringify(req.body);
  return new Request(url, { method: req.method, headers, body: bodyJson });
}

/**
 * Write a Web-standard `Response` back to an express `Response`.
 * Streams the body chunk-by-chunk so SSE works without buffering.
 */
async function pipeWebResponseToExpress(
  webRes: Response,
  res: ExpressResponse,
): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (webRes.body === null) {
    res.end();
    return;
  }
  const reader = webRes.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

// ============================================================================
// Exported factories
// ============================================================================

/**
 * Returns an Express `RequestHandler` that streams a generate call as SSE.
 *
 * Body shape accepted: `{ prompt: string; endUserId?: string; appId?: string }`
 */
export function createGenerateHandler(opts: GenerateHandlerOptions): RequestHandler {
  const coreHandler = coreGenerateHandler({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    endUserId: opts.endUserId
      ? (webReq: Request) => {
          // The x-user-id header is available on the Web Request; express opts.endUserId
          // receives the original express req via closure — pass the header value as a
          // synthetic express request shaped enough for the callback.
          const userId = webReq.headers.get('x-user-id');
          return userId ?? '';
        }
      : undefined,
  });
  return async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    if (opts.endUserId) {
      const userId = opts.endUserId(req);
      if (userId) req.headers['x-user-id'] = userId;
    }
    const webReq = expressReqToWebRequest(req);
    const webRes = await coreHandler(webReq);
    await pipeWebResponseToExpress(webRes, res);
  };
}

/**
 * Returns an Express `RequestHandler` that calls `editSchema` and returns JSON.
 *
 * Body shape accepted: `{ appId: string; patch: EditSchemaPatch }`
 */
export function createEditHandler(opts: GenerateHandlerOptions): RequestHandler {
  const coreHandler = coreEditHandler({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });
  return async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    const webReq = expressReqToWebRequest(req);
    const webRes = await coreHandler(webReq);
    await pipeWebResponseToExpress(webRes, res);
  };
}
