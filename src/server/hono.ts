/**
 * `@almadar/sdk/server/hono` — Hono adapter for the Almadar server handlers.
 *
 * Hono is Fetch-native, so this is a near-passthrough: each factory wraps the
 * core Web-standard handler in a Hono-compatible `Handler`.
 *
 * Node-only. The consumer must provide their own `hono` installation.
 *
 * Usage:
 *   import { Hono } from 'hono';
 *   import { createGenerateHandler, createEditHandler } from '@almadar/sdk/server/hono';
 *   const app = new Hono();
 *   app.post('/api/agent/generate', createGenerateHandler({ apiKey }));
 *   app.put('/api/agent/edit', createEditHandler({ apiKey }));
 */

import type { Context, Handler } from 'hono';
import {
  createGenerateHandler as coreGenerateHandler,
  createEditHandler as coreEditHandler,
} from './index';
import type { GenerateHandlerOptions } from './index';

export type { GenerateHandlerOptions };

/**
 * Returns a Hono `Handler` that streams a generate call as SSE.
 *
 * Body shape accepted: `{ prompt: string; endUserId?: string; appId?: string }`
 */
export function createGenerateHandler(opts: GenerateHandlerOptions): Handler {
  const handler = coreGenerateHandler(opts);
  return (c: Context) => handler(c.req.raw);
}

/**
 * Returns a Hono `Handler` that calls `editSchema` and returns JSON.
 *
 * Body shape accepted: `{ appId: string; patch: EditSchemaPatch }`
 */
export function createEditHandler(opts: GenerateHandlerOptions): Handler {
  const handler = coreEditHandler(opts);
  return (c: Context) => handler(c.req.raw);
}
