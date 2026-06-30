/**
 * `@almadar/sdk/server` — Framework-agnostic Web-standard Fetch handlers for
 * the Almadar agent proxy. Node-only; never import from browser or React code.
 *
 * Usage:
 *   import { createGenerateHandler, createEditHandler } from '@almadar/sdk/server';
 *   const handler = createGenerateHandler({ apiKey: process.env.ALMADAR_API_KEY! });
 *   // handler: (request: Request) => Promise<Response>
 *
 * For framework adapters see `@almadar/sdk/server/express` and `@almadar/sdk/server/hono`.
 */

import type { OrbitalSchema } from '@almadar/core';
import { AlmadarClient } from '../client/AlmadarClient';
import type { EditSchemaRequest, EditSchemaPatch, GenerateRequest, SSEEvent } from '../types';

// ============================================================================
// Public option surface
// ============================================================================

export interface GenerateHandlerOptions {
  /** API key issued from Studio's /settings/sdk panel. */
  apiKey: string;
  /** Defaults to https://studio.almadar.io. */
  baseUrl?: string;
  /**
   * Derive a stable end-user id from the incoming Web Request.
   * Falls back to the `x-user-id` request header when omitted.
   */
  endUserId?: (req: Request) => string;
}

// ============================================================================
// Internal helpers
// ============================================================================

function resolveEndUserId(opts: GenerateHandlerOptions, req: Request): string | undefined {
  if (opts.endUserId) return opts.endUserId(req);
  const header = req.headers.get('x-user-id');
  return typeof header === 'string' && header.length > 0 ? header : undefined;
}

function encodeSseEvent(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ============================================================================
// createGenerateHandler
// ============================================================================

/**
 * Returns a Web-standard Fetch handler that streams a generate call as SSE.
 *
 * Body shape accepted: `{ prompt: string; endUserId?: string; appId?: string }`
 */
export function createGenerateHandler(
  opts: GenerateHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    let body: GenerateRequest;
    try {
      body = (await request.json()) as GenerateRequest;
    } catch {
      return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const rawPrompt = body.prompt ?? body.message;
    const prompt = typeof rawPrompt === 'string' ? rawPrompt : '';

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt or message is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const bodyEndUserId = typeof body.endUserId === 'string' ? body.endUserId : undefined;
    const endUserId = bodyEndUserId ?? resolveEndUserId(opts, request);
    const appId = typeof body.appId === 'string' ? body.appId : undefined;

    const client = new AlmadarClient({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          await client.generate({
            prompt,
            endUserId,
            appId,
            onEvent: (event: SSEEvent) => {
              controller.enqueue(encoder.encode(encodeSseEvent(event)));
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const errorEvent: SSEEvent = {
            type: 'error',
            timestamp: Date.now(),
            data: { error: message },
          };
          controller.enqueue(encoder.encode(encodeSseEvent(errorEvent)));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  };
}

// ============================================================================
// createEditHandler
// ============================================================================

/**
 * Returns a Web-standard Fetch handler that calls `editSchema` and returns JSON.
 *
 * Body shape accepted: `{ appId: string; patch: EditSchemaPatch }`
 */
export function createEditHandler(
  opts: GenerateHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    let body: EditSchemaRequest;
    try {
      body = (await request.json()) as EditSchemaRequest;
    } catch {
      return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const appId = typeof body.appId === 'string' ? body.appId : '';
    if (!appId) {
      return new Response(JSON.stringify({ error: 'appId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const patch: EditSchemaPatch | undefined = body.patch;
    if (patch === undefined || patch === null || typeof patch !== 'object') {
      return new Response(JSON.stringify({ error: 'patch is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const client = new AlmadarClient({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });

    try {
      const schema: OrbitalSchema = await client.editSchema(appId, patch);
      return new Response(JSON.stringify(schema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  };
}
