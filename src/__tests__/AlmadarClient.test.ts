import { describe, expect, it, vi } from 'vitest';
import { AlmadarClient } from '../client/AlmadarClient';
import { ApiKeyError, AsyncUnsupportedError, GenerationFailedError, PinError } from '../client/errors';
import { API_ERROR_CODES } from '../types';
import type { GenerateMeta, GeneratePin, GenerateStreamEvent, OrbitalSchema } from '../types';

const SAMPLE_SCHEMA: OrbitalSchema = {
  name: 'sample',
  orbitals: [
    {
      name: 'DashboardOrbital',
      entity: { name: 'Dashboard', fields: [{ name: 'id', type: 'string' }] },
      traits: [],
      pages: [{ name: 'HomePage', path: '/' }],
    },
  ],
};

const SAMPLE_META: GenerateMeta = {
  tier: 'hit',
  organisms: [{ name: 'DashboardOrbital', source: 'factory' }],
  demoted: [],
  cacheVerdict: { verdict: 'hit', chosen: 'DashboardOrbital' },
  durationMs: 1234,
};

function sseResponse(events: readonly GenerateStreamEvent[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('AlmadarClient', () => {
  it('streams SSE events and resolves with the final schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        {
          type: 'start',
          timestamp: 1,
          data: { threadId: 't1', skill: 'rabit', workDir: '/tmp/x' },
        },
        {
          type: 'orbital_added',
          timestamp: 2,
          data: { appId: 'app-1', orbitalName: 'Dashboard', orbitalIndex: 0, totalOrbitals: 1 },
        },
        {
          type: 'schema_update',
          timestamp: 3,
          data: { appId: 'app-1', version: 1, schema: SAMPLE_SCHEMA, isNew: true },
        },
        {
          type: 'complete',
          timestamp: 4,
          data: {
            threadId: 't1',
            skill: 'rabit',
            workDir: '/tmp/x',
            schemaGenerated: true,
            appCompiled: false,
            schema: SAMPLE_SCHEMA,
            appId: 'app-1',
          },
        },
      ]),
    );
    const client = new AlmadarClient({ apiKey: 'sk_test', baseUrl: 'http://test', fetch: fetchMock });
    const seen: SSEEvent[] = [];
    const result = await client.generate({
      prompt: 'hello',
      onEvent: (e) => seen.push(e),
    });
    expect(result.schema.name).toBe('sample');
    expect(result.appId).toBe('app-1');
    expect(seen.map((e) => e.type)).toEqual(['start', 'orbital_added', 'schema_update', 'complete']);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer sk_test',
      accept: 'text/event-stream',
    });
  });

  it('throws ApiKeyError on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 4001, message: 'Invalid key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new AlmadarClient({ apiKey: 'sk_bad', baseUrl: 'http://test', fetch: fetchMock });
    await expect(client.generate({ prompt: 'hi' })).rejects.toBeInstanceOf(ApiKeyError);
  });

  it('editSchema PUTs and returns the typed schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: 'edited', orbitals: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new AlmadarClient({ apiKey: 'sk_test', baseUrl: 'http://test', fetch: fetchMock });
    const schema = await client.editSchema('app-1', { orbital: 'X' });
    expect(schema.name).toBe('edited');
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('throws AsyncUnsupportedError for async:true and makes no network call', async () => {
    const fetchMock = vi.fn();
    const client = new AlmadarClient({ apiKey: 'sk_test', baseUrl: 'http://test', fetch: fetchMock });
    await expect(client.generate({ prompt: 'hi', async: true })).rejects.toBeInstanceOf(AsyncUnsupportedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serializes `pin` into the generate POST body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        {
          type: 'complete',
          timestamp: 1,
          data: {
            threadId: 't1',
            skill: 'rabit',
            workDir: '/tmp/x',
            schemaGenerated: true,
            appCompiled: false,
            schema: SAMPLE_SCHEMA,
            appId: 'app-1',
          },
        },
      ]),
    );
    const client = new AlmadarClient({ apiKey: 'sk_test', baseUrl: 'http://test', fetch: fetchMock });
    const pin: GeneratePin = { organism: 'DashboardOrbital', knobs: { theme: 'dark' } };
    await client.generate({ prompt: 'hello', pin });
    const [, init] = fetchMock.mock.calls[0];
    const body: { pin?: GeneratePin } = JSON.parse((init as RequestInit).body as string);
    expect(body.pin).toEqual(pin);
  });

  it('captures a generation_meta SSE event and attaches it to the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        { type: 'generation_meta', timestamp: 1, data: SAMPLE_META },
        {
          type: 'complete',
          timestamp: 2,
          data: {
            threadId: 't1',
            skill: 'rabit',
            workDir: '/tmp/x',
            schemaGenerated: true,
            appCompiled: false,
            schema: SAMPLE_SCHEMA,
            appId: 'app-1',
          },
        },
      ]),
    );
    const client = new AlmadarClient({ apiKey: 'sk_test', baseUrl: 'http://test', fetch: fetchMock });
    const seen: GenerateStreamEvent[] = [];
    const result = await client.generate({ prompt: 'hello', onEvent: (e) => seen.push(e) });
    expect(result.meta).toEqual(SAMPLE_META);
    expect(seen.some((e) => e.type === 'generation_meta')).toBe(true);
  });

  it('leaves result.meta undefined when no generation_meta event is sent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        {
          type: 'complete',
          timestamp: 1,
          data: {
            threadId: 't1',
            skill: 'rabit',
            workDir: '/tmp/x',
            schemaGenerated: true,
            appCompiled: false,
            schema: SAMPLE_SCHEMA,
            appId: 'app-1',
          },
        },
      ]),
    );
    const client = new AlmadarClient({ apiKey: 'sk_test', baseUrl: 'http://test', fetch: fetchMock });
    const result = await client.generate({ prompt: 'hello' });
    expect(result.meta).toBeUndefined();
  });

  it('throws GenerationFailedError for an SSE error event with code "failed"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([{ type: 'error', timestamp: 1, data: { error: 'boom', code: 'failed' } }]),
    );
    const client = new AlmadarClient({ apiKey: 'sk_test', baseUrl: 'http://test', fetch: fetchMock });
    const err: unknown = await client.generate({ prompt: 'hello' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GenerationFailedError);
    expect(err instanceof GenerationFailedError && err.code).toBe(API_ERROR_CODES.GENERATION_FAILED);
  });

  it('throws PinError on an HTTP error body carrying a pin error code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 4041, message: 'Unknown organism' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new AlmadarClient({ apiKey: 'sk_bad', baseUrl: 'http://test', fetch: fetchMock });
    await expect(client.generate({ prompt: 'hi' })).rejects.toBeInstanceOf(PinError);
  });
});
