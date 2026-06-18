// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrbitalSchema } from '@almadar/core';
import type { AgentEvent } from '../types';
import type { Request, Response } from 'express';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_SCHEMA: OrbitalSchema = { name: 'test-app', orbitals: [] };

function makeSseStream(events: AgentEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      }
      controller.close();
    },
  });
}

function makeFakeFetch(events: AgentEvent[]): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(makeSseStream(events), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
  ) as unknown as typeof fetch;
}

function makeFakeReq(body: Record<string, unknown> = {}): Request {
  return {
    body,
    headers: {},
    on: vi.fn(),
  } as unknown as Request;
}

function makeFakeRes(): { res: Response; written: string[]; headers: Record<string, string> } {
  const written: string[] = [];
  const headers: Record<string, string> = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn(),
    write: vi.fn((chunk: string) => { written.push(chunk); }),
    setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }),
    on: vi.fn(),
  } as unknown as Response;
  return { res, written, headers };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

import { createGenerateHandler, createEditHandler } from '../server/index.js';

describe('createGenerateHandler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sets SSE headers, streams events, and calls res.end', async () => {
    const events: AgentEvent[] = [
      { type: 'start', threadId: 't1', workDir: '/tmp' },
      { type: 'complete', schema: FAKE_SCHEMA },
    ];
    const fakeFetch = makeFakeFetch(events);
    globalThis.fetch = fakeFetch;

    const handler = createGenerateHandler({ apiKey: 'sk_test', baseUrl: 'http://test' });
    const req = makeFakeReq({ prompt: 'build me a dashboard' });
    const { res, written, headers } = makeFakeRes();

    await handler(req, res);

    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toBe('no-cache');
    expect(headers['Connection']).toBe('keep-alive');

    const parsedEvents = written.map((chunk) =>
      JSON.parse(chunk.replace(/^data: /, '').trim()) as AgentEvent,
    );
    expect(parsedEvents.map((e) => e.type)).toContain('complete');

    const completeEvent = parsedEvents.find((e) => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    expect((completeEvent as Extract<AgentEvent, { type: 'complete' }>).schema).toEqual(FAKE_SCHEMA);

    const resAny = res as unknown as { end: ReturnType<typeof vi.fn> };
    expect(resAny.end).toHaveBeenCalledOnce();
  });

  it('returns 400 when prompt is missing', async () => {
    const handler = createGenerateHandler({ apiKey: 'sk_test', baseUrl: 'http://test' });
    const req = makeFakeReq({});
    const { res } = makeFakeRes();

    await handler(req, res);

    const resAny = res as unknown as {
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };
    expect(resAny.status).toHaveBeenCalledWith(400);
    expect(resAny.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('emits error SSE event when client.generate throws', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 500, message: 'upstream error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const handler = createGenerateHandler({ apiKey: 'sk_test', baseUrl: 'http://test' });
    const req = makeFakeReq({ prompt: 'build something' });
    const { res, written } = makeFakeRes();

    await handler(req, res);

    const parsedEvents = written.map((chunk) =>
      JSON.parse(chunk.replace(/^data: /, '').trim()) as AgentEvent,
    );
    expect(parsedEvents.some((e) => e.type === 'error')).toBe(true);

    const resAny = res as unknown as { end: ReturnType<typeof vi.fn> };
    expect(resAny.end).toHaveBeenCalledOnce();
  });
});

describe('createEditHandler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when appId is missing', async () => {
    const handler = createEditHandler({ apiKey: 'sk_test', baseUrl: 'http://test' });
    const req = makeFakeReq({ patch: { orbital: 'X' } });
    const { res } = makeFakeRes();

    await handler(req, res);

    const resAny = res as unknown as { status: ReturnType<typeof vi.fn> };
    expect(resAny.status).toHaveBeenCalledWith(400);
  });

  it('returns schema JSON on success', async () => {
    const editedSchema: OrbitalSchema = { name: 'edited', orbitals: [] };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(editedSchema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const handler = createEditHandler({ apiKey: 'sk_test', baseUrl: 'http://test' });
    const req = makeFakeReq({ appId: 'app-1', patch: { orbital: 'X' } });
    const { res } = makeFakeRes();

    await handler(req, res);

    const resAny = res as unknown as { json: ReturnType<typeof vi.fn> };
    expect(resAny.json).toHaveBeenCalledWith(editedSchema);
  });
});
