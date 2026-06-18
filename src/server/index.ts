/**
 * `@almadar/sdk/server` — Express handler factories for the Almadar agent.
 *
 * Node-only. Never import this from browser or React code.
 *
 * Usage:
 *   import { createGenerateHandler, createEditHandler } from '@almadar/sdk/server';
 */

import type { Request, Response } from 'express';
import type { OrbitalSchema } from '@almadar/core';
import { AlmadarClient } from '../client/AlmadarClient';
import type { AgentEvent, EditSchemaPatch } from '../types';

// ============================================================================
// Public option surface
// ============================================================================

export interface GenerateHandlerOptions {
  /** API key issued from Studio's /settings/sdk panel. */
  apiKey: string;
  /** Defaults to https://studio.almadar.io. */
  baseUrl?: string;
  /** Derive a stable end-user id from the request. */
  endUserId?: (req: Request) => string;
}

// ============================================================================
// Internal helpers
// ============================================================================

function resolveEndUserId(opts: GenerateHandlerOptions, req: Request): string | undefined {
  if (opts.endUserId) return opts.endUserId(req);
  const header = req.headers['x-user-id'];
  return typeof header === 'string' && header.length > 0 ? header : undefined;
}

function writeSseEvent(res: Response, event: AgentEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ============================================================================
// createGenerateHandler
// ============================================================================

/**
 * Returns an Express route handler that streams a generate call as SSE.
 *
 * Body shape accepted: `{ prompt: string; endUserId?: string; appId?: string }`
 */
export function createGenerateHandler(
  opts: GenerateHandlerOptions,
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    const rawPrompt = body['prompt'] ?? body['message'];
    const prompt = typeof rawPrompt === 'string' ? rawPrompt : '';

    if (!prompt) {
      res.status(400).json({ error: 'prompt or message is required' });
      return;
    }

    const bodyEndUserId = typeof body['endUserId'] === 'string' ? body['endUserId'] : undefined;
    const endUserId = bodyEndUserId ?? resolveEndUserId(opts, req);
    const appId = typeof body['appId'] === 'string' ? body['appId'] : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const client = new AlmadarClient({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });

    try {
      await client.generate({
        prompt,
        endUserId,
        appId,
        onEvent: (event: AgentEvent) => {
          writeSseEvent(res, event);
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errorEvent: AgentEvent = { type: 'error', message };
      writeSseEvent(res, errorEvent);
    } finally {
      res.end();
    }
  };
}

// ============================================================================
// createEditHandler
// ============================================================================

/**
 * Returns an Express route handler that calls `editSchema` and returns JSON.
 *
 * Body shape accepted: `{ appId: string; patch: EditSchemaPatch }`
 */
export function createEditHandler(
  opts: GenerateHandlerOptions,
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    const appId = typeof body['appId'] === 'string' ? body['appId'] : '';

    if (!appId) {
      res.status(400).json({ error: 'appId is required' });
      return;
    }

    const patch = body['patch'] as EditSchemaPatch | undefined;
    if (patch === undefined || patch === null || typeof patch !== 'object') {
      res.status(400).json({ error: 'patch is required' });
      return;
    }

    const client = new AlmadarClient({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });

    try {
      const schema: OrbitalSchema = await client.editSchema(appId, patch);
      res.json(schema);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  };
}
