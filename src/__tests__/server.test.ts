// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrbitalSchema } from '@almadar/core';
import type { AgentEvent, GenerateRequest, EditSchemaRequest } from '../types';
import type { Request, Response } from 'express';

// ─── Typed test-harness interfaces ───────────────────────────────────────────

/** Minimal subset of express.Request used by the handlers under test. */
interface FakeRequest extends Partial<Request> {
  body: GenerateRequest | EditSchemaRequest;
  headers: Record<string, string>;
}

/** Subset of express.Response methods tracked by the fake. */
interface FakeResponse extends Partial<Response> {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
}

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
  const mockFn = vi.fn().mockResolvedValue(
    new Response(makeSseStream(events), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
  return mockFn as typeof fetch;
}

function makeFakeReq(body: GenerateRequest | EditSchemaRequest): Request {
  const req: FakeRequest = {
    body,
    headers: {},
    on: vi.fn(),
  };
  return req as Request;
}

function makeFakeRes(): { res: Response; fake: FakeResponse; written: string[] } {
  const written: string[] = [];
  const fake: FakeResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn(),
    write: vi.fn((chunk: string) => { written.push(chunk); }),
    setHeader: vi.fn(),
    on: vi.fn(),
  };
  return { res: fake as Response, fake, written };
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
    const { res, fake, written } = makeFakeRes();

    await handler(req, res);

    expect(fake.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(fake.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(fake.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');

    const parsedEvents = written.map((chunk) =>
      JSON.parse(chunk.replace(/^data: /, '').trim()) as AgentEvent,
    );
    expect(parsedEvents.map((e) => e.type)).toContain('complete');

    const completeEvent = parsedEvents.find((e) => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    expect((completeEvent as Extract<AgentEvent, { type: 'complete' }>).schema).toEqual(FAKE_SCHEMA);

    expect(fake.end).toHaveBeenCalledOnce();
  });

  it('returns 400 when prompt is missing', async () => {
    const handler = createGenerateHandler({ apiKey: 'sk_test', baseUrl: 'http://test' });
    const req = makeFakeReq({});
    const { res, fake } = makeFakeRes();

    await handler(req, res);

    expect(fake.status).toHaveBeenCalledWith(400);
    expect(fake.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('emits error SSE event when client.generate throws', async () => {
    const errorFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 500, message: 'upstream error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    globalThis.fetch = errorFetch as typeof fetch;

    const handler = createGenerateHandler({ apiKey: 'sk_test', baseUrl: 'http://test' });
    const req = makeFakeReq({ prompt: 'build something' });
    const { res, fake, written } = makeFakeRes();

    await handler(req, res);

    const parsedEvents = written.map((chunk) =>
      JSON.parse(chunk.replace(/^data: /, '').trim()) as AgentEvent,
    );
    expect(parsedEvents.some((e) => e.type === 'error')).toBe(true);

    expect(fake.end).toHaveBeenCalledOnce();
  });
});

describe('createEditHandler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when appId is missing', async () => {
    const handler = createEditHandler({ apiKey: 'sk_test', baseUrl: 'http://test' });
    const req = makeFakeReq({ patch: { orbital: 'X' } });
    const { res, fake } = makeFakeRes();

    await handler(req, res);

    expect(fake.status).toHaveBeenCalledWith(400);
  });

  it('returns schema JSON on success', async () => {
    const editedSchema: OrbitalSchema = { name: 'edited', orbitals: [] };
    const successFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(editedSchema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    globalThis.fetch = successFetch as typeof fetch;

    const handler = createEditHandler({ apiKey: 'sk_test', baseUrl: 'http://test' });
    const req = makeFakeReq({ appId: 'app-1', patch: { orbital: 'X' } });
    const { res, fake } = makeFakeRes();

    await handler(req, res);

    expect(fake.json).toHaveBeenCalledWith(editedSchema);
  });
});
