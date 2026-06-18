// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrbitalSchema } from '@almadar/core';

// ─── Mock @almadar-io/rabit ──────────────────────────────────────────────────

const { mockTraceToSSE, mockIsTraceEvent, mockRunRabit } = vi.hoisted(() => {
  const fakeSchema: OrbitalSchema = { name: 'test-app', orbitals: [] };
  return {
    mockTraceToSSE: vi.fn().mockReturnValue([]),
    mockIsTraceEvent: vi.fn().mockReturnValue(false),
    mockRunRabit: vi.fn().mockResolvedValue({
      success: true,
      composedSchema: fakeSchema,
      failedOrbitals: [],
      durationMs: 100,
      finalPhase: 'done',
    }),
  };
});

vi.mock('@almadar-io/rabit', () => {
  class PauseController {
    pause(): void { /* no-op */ }
    resume(): void { /* no-op */ }
    isPaused(): boolean { return false; }
    async awaitResume(): Promise<void> { /* no-op */ }
  }
  return {
    runRabit: mockRunRabit,
    runContextualEdit: vi.fn().mockResolvedValue({
      success: true,
      tier: 1,
      surface: 'params',
      patchesRecorded: 0,
      knobsEdited: 1,
    }),
    PauseController,
    traceToSSE: mockTraceToSSE,
    isTraceEvent: mockIsTraceEvent,
  };
});

// ─── Mock @almadar/workspace ─────────────────────────────────────────────────

const { mockSubscribe, mockReadSchema, fakeWorkspace } = vi.hoisted(() => {
  const fakeSchema: OrbitalSchema = { name: 'test-app', orbitals: [] };
  const mockSubscribe = vi.fn().mockReturnValue(() => { /* unsubscribe */ });
  const mockReadSchema = vi.fn().mockReturnValue(JSON.stringify(fakeSchema));
  const fakeWorkspace = {
    appId: 'app-1' as string | undefined,
    workDir: '/tmp/ws',
    subscribe: mockSubscribe,
    readSchema: mockReadSchema,
  };
  return { mockSubscribe, mockReadSchema, fakeWorkspace };
});

vi.mock('@almadar/workspace', () => ({
  openWorkspace: vi.fn().mockResolvedValue(fakeWorkspace),
}));

// ─── Mock @almadar/server ────────────────────────────────────────────────────

const { mockSetupSSE, mockSendSSEEvent, mockCloseSSE } = vi.hoisted(() => ({
  mockSetupSSE: vi.fn(),
  mockSendSSEEvent: vi.fn(),
  mockCloseSSE: vi.fn(),
}));

vi.mock('@almadar/server', () => ({
  setupSSE: mockSetupSSE,
  sendSSEEvent: mockSendSSEEvent,
  closeSSE: mockCloseSSE,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

import type { Request, Response } from 'express';

function makeFakeReq(body: Record<string, unknown> = {}): Request {
  return {
    body,
    headers: {},
    on: vi.fn(),
  } as unknown as Request;
}

function makeFakeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as Response;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

import { createGenerateHandler } from '../server/index.js';

const FAKE_SCHEMA: OrbitalSchema = { name: 'test-app', orbitals: [] };

describe('createGenerateHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockReturnValue(() => { /* unsubscribe */ });
    mockRunRabit.mockResolvedValue({
      success: true,
      composedSchema: FAKE_SCHEMA,
      failedOrbitals: [],
      durationMs: 100,
      finalPhase: 'done',
    });
  });

  it('sets up SSE headers, emits start + complete, and calls onComplete', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const handler = createGenerateHandler({
      workspaceFactory: () => fakeWorkspace,
      onComplete,
    });

    const req = makeFakeReq({ prompt: 'build me a dashboard' });
    const res = makeFakeRes();

    await handler(req, res);

    expect(mockSetupSSE).toHaveBeenCalledOnce();

    const sentTypes = mockSendSSEEvent.mock.calls.map(
      (call) => (call[1] as { type: string }).type,
    );
    expect(sentTypes).toContain('start');
    expect(sentTypes).toContain('complete');

    const completeCall = mockSendSSEEvent.mock.calls.find(
      (call) => (call[1] as { type: string }).type === 'complete',
    );
    expect(completeCall).toBeDefined();
    const completeData = (completeCall![1] as { data: { schema: OrbitalSchema } }).data;
    expect(completeData.schema).toEqual(FAKE_SCHEMA);

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(FAKE_SCHEMA, req);

    expect(mockCloseSSE).toHaveBeenCalledOnce();
  });

  it('returns 400 when prompt is missing', async () => {
    const handler = createGenerateHandler({
      workspaceFactory: () => fakeWorkspace,
    });
    const req = makeFakeReq({});
    const res = makeFakeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
    );
    expect(mockSetupSSE).not.toHaveBeenCalled();
  });

  it('emits error SSE when rabit fails', async () => {
    mockRunRabit.mockResolvedValueOnce({
      success: false,
      composedSchema: null,
      failedOrbitals: ['CartOrbital'],
      durationMs: 50,
      finalPhase: 'failed',
    });

    const handler = createGenerateHandler({
      workspaceFactory: () => fakeWorkspace,
    });
    const req = makeFakeReq({ prompt: 'build something' });
    const res = makeFakeRes();

    await handler(req, res);

    const sentTypes = mockSendSSEEvent.mock.calls.map(
      (call) => (call[1] as { type: string }).type,
    );
    expect(sentTypes).toContain('error');
    expect(sentTypes).not.toContain('complete');
  });
});
