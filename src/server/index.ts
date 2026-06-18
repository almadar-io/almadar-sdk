/**
 * `@almadar/sdk/server` — Express handler factories for the Almadar agent.
 *
 * Node-only. Never import this from browser or React code.
 *
 * Usage:
 *   import { createGenerateHandler, createEditHandler } from '@almadar/sdk/server';
 */

import type { Request, Response } from 'express';
import type { WorkspaceService } from '@almadar/workspace';
import type { OrbitalSchema } from '@almadar/core';
import type { ProviderConfig } from '@almadar/llm';
import {
  runRabit,
  runContextualEdit,
  PauseController,
  traceToSSE,
  isTraceEvent,
  type RabitOptions,
  type MapperContext,
} from '@almadar-io/rabit';
import {
  setupSSE,
  sendSSEEvent,
  closeSSE,
} from '@almadar/server';

// ============================================================================
// Types
// ============================================================================

// Canonical provider-credential type lives in `@almadar/llm`; re-export it so
// callers get the exact shape `runRabit` consumes without a local shadow.
export type { ProviderConfig };

// ============================================================================
// Public option surface
// ============================================================================

export interface GenerateHandlerOptions {
  /** Open (or return) the workspace for this request. */
  workspaceFactory: (req: Request) => Promise<WorkspaceService> | WorkspaceService;
  /** LLM provider — defaults to `'deepseek'`. */
  provider?: string;
  /** LLM model — defaults to `'deepseek-v4-flash'`. */
  model?: string;
  /** Std-catalog scope forwarded to rabit. */
  catalogScope?: {
    mode: 'extend' | 'subset' | 'replace';
    stdAllowList?: readonly string[];
  };
  /** Return explicit provider credentials for the given provider string. */
  resolveProviderConfig?: (
    provider: string,
  ) => Promise<ProviderConfig | undefined> | ProviderConfig | undefined;
  /** Called once with the final composed schema after a successful generate. */
  onComplete?: (schema: OrbitalSchema, req: Request) => Promise<void> | void;
  /** Derive a stable user id from the request — defaults to `'anonymous'`. */
  userId?: (req: Request) => string;
}

// ============================================================================
// Internal helpers
// ============================================================================

function resolveUserId(opts: GenerateHandlerOptions, req: Request): string {
  if (opts.userId) return opts.userId(req);
  const header = req.headers['x-user-id'];
  return typeof header === 'string' && header.length > 0 ? header : 'anonymous';
}

async function resolveExtraProviderConfig(
  opts: GenerateHandlerOptions,
  provider: string,
): Promise<ProviderConfig | undefined> {
  if (!opts.resolveProviderConfig) return undefined;
  return opts.resolveProviderConfig(provider);
}

function makeThreadId(workspace: WorkspaceService): string {
  return (
    workspace.appId ??
    `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

// ============================================================================
// createGenerateHandler
// ============================================================================

/**
 * Returns an Express route handler that streams a rabit generation run as SSE.
 *
 * Body shape accepted:
 *   `{ prompt?: string; message?: string; provider?: string; model?: string; appId?: string }`
 *
 * SSE events emitted:
 *   `start` → trace fan-out → `complete | error | cancelled`
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

    const provider =
      (typeof body['provider'] === 'string' ? body['provider'] : undefined) ??
      opts.provider ??
      'deepseek';
    const model =
      (typeof body['model'] === 'string' ? body['model'] : undefined) ??
      opts.model ??
      'deepseek-v4-flash';
    const userId = resolveUserId(opts, req);

    let workspace: WorkspaceService;
    try {
      workspace = await opts.workspaceFactory(req);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Workspace open failed: ${message}` });
      return;
    }

    setupSSE(res);

    const threadId = makeThreadId(workspace);
    const abortController = new AbortController();
    const pauseController = new PauseController();

    const ctx: MapperContext = {
      threadId,
      workDir: workspace.workDir,
      userId,
      ...(workspace.appId !== undefined ? { appId: workspace.appId } : {}),
    };

    const unsubscribe = workspace.subscribe({
      onWrite(event) {
        if (event.kind !== 'trace') return;
        if (!isTraceEvent(event.event)) return;
        for (const sseEvent of traceToSSE(event.event, ctx)) {
          sendSSEEvent(res, sseEvent);
        }
      },
    });

    sendSSEEvent(res, {
      type: 'start',
      data: { threadId, skill: 'rabit', workDir: workspace.workDir },
      timestamp: Date.now(),
    });

    res.on('close', () => {
      abortController.abort();
    });

    const catalogMode = opts.catalogScope?.mode;
    const stdAllowList = opts.catalogScope?.stdAllowList;
    const extraProviderConfig = await resolveExtraProviderConfig(opts, provider);

    const rabitOpts: RabitOptions = {
      prompt,
      workDir: workspace.workDir,
      userId,
      provider,
      model,
      workspace,
      signal: abortController.signal,
      pauseController,
      ...(catalogMode !== undefined ? { catalogMode } : {}),
      ...(stdAllowList !== undefined ? { stdAllowList } : {}),
      ...(extraProviderConfig !== undefined ? { providerConfig: extraProviderConfig } : {}),
    };

    try {
      const result = await runRabit(rabitOpts);

      if (result.success && result.composedSchema !== null) {
        sendSSEEvent(res, {
          type: 'complete',
          data: {
            threadId,
            skill: 'rabit',
            workDir: workspace.workDir,
            schemaGenerated: true,
            appCompiled: false,
            schema: result.composedSchema,
            ...(workspace.appId !== undefined ? { appId: workspace.appId } : {}),
          },
          timestamp: Date.now(),
        });
        try {
          await opts.onComplete?.(result.composedSchema, req);
        } catch {
          // onComplete errors do not fail the SSE stream — schema was generated
        }
      } else if (result.success) {
        sendSSEEvent(res, {
          type: 'complete',
          data: {
            threadId,
            skill: 'rabit',
            workDir: workspace.workDir,
            schemaGenerated: false,
            appCompiled: false,
          },
          timestamp: Date.now(),
        });
      } else {
        const failList = result.failedOrbitals.join(', ');
        sendSSEEvent(res, {
          type: 'error',
          data: {
            error: `Generation failed${failList.length > 0 ? `: ${failList}` : ''}`,
            code: 'failed',
          },
          timestamp: Date.now(),
        });
      }
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || abortController.signal.aborted);
      if (isAbort) {
        sendSSEEvent(res, {
          type: 'cancelled',
          data: { threadId, message: 'Generation cancelled' },
          timestamp: Date.now(),
        });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        sendSSEEvent(res, {
          type: 'error',
          data: { error: message, code: 'runtime' },
          timestamp: Date.now(),
        });
      }
    } finally {
      try {
        unsubscribe();
      } catch {
        // best-effort
      }
      closeSSE(res);
    }
  };
}

// ============================================================================
// createEditHandler
// ============================================================================

/**
 * Returns an Express route handler that streams a contextual-edit run as SSE.
 *
 * Body shape accepted:
 *   `{ focus: EditFocus; instruction?: string; message?: string; provider?: string; model?: string }`
 *
 * The `focus` field must be a valid `EditFocus` (orbital + trait + patternType
 * + path — see `@almadar/core`'s `EditFocus` type). The handler delegates
 * entirely to `runContextualEdit` from `@almadar-io/rabit`.
 *
 * TODO: when `focus` is absent the handler falls back to a full-regeneration
 * pass (`createGenerateHandler` semantics). Wire a dedicated delta-prompt edit
 * path here once rabit exposes a `runDeltaEdit` entry point.
 */
export function createEditHandler(
  opts: GenerateHandlerOptions,
): (req: Request, res: Response) => Promise<void> {
  const generateHandler = createGenerateHandler(opts);

  return async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    const focus = body['focus'];

    // Without a focus, fall back to a full regeneration pass.
    if (focus === undefined || focus === null) {
      return generateHandler(req, res);
    }

    const rawInstruction = body['instruction'] ?? body['message'];
    const instruction =
      typeof rawInstruction === 'string' ? rawInstruction : '';

    if (!instruction) {
      res.status(400).json({ error: 'instruction or message is required' });
      return;
    }

    const provider =
      (typeof body['provider'] === 'string' ? body['provider'] : undefined) ??
      opts.provider ??
      'deepseek';
    const model =
      (typeof body['model'] === 'string' ? body['model'] : undefined) ??
      opts.model ??
      'deepseek-v4-flash';
    const userId = resolveUserId(opts, req);

    let workspace: WorkspaceService;
    try {
      workspace = await opts.workspaceFactory(req);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Workspace open failed: ${message}` });
      return;
    }

    setupSSE(res);

    const threadId = makeThreadId(workspace);
    const abortController = new AbortController();

    const ctx: MapperContext = {
      threadId,
      workDir: workspace.workDir,
      userId,
      ...(workspace.appId !== undefined ? { appId: workspace.appId } : {}),
    };

    const unsubscribe = workspace.subscribe({
      onWrite(event) {
        if (event.kind !== 'trace') return;
        if (!isTraceEvent(event.event)) return;
        for (const sseEvent of traceToSSE(event.event, ctx)) {
          sendSSEEvent(res, sseEvent);
        }
      },
    });

    sendSSEEvent(res, {
      type: 'start',
      data: { threadId, skill: 'rabit', workDir: workspace.workDir },
      timestamp: Date.now(),
    });

    res.on('close', () => {
      abortController.abort();
    });

    const extraProviderConfig = await resolveExtraProviderConfig(opts, provider);

    try {
      const editResult = await runContextualEdit({
        // EditFocus is validated at runtime by rabit; we pass through as-is.
        focus: focus as Parameters<typeof runContextualEdit>[0]['focus'],
        instruction,
        workDir: workspace.workDir,
        provider,
        model,
        userId,
        workspace,
        signal: abortController.signal,
        ...(extraProviderConfig !== undefined ? { providerConfig: extraProviderConfig } : {}),
      });

      if (!editResult.success) {
        sendSSEEvent(res, {
          type: 'error',
          data: {
            error: editResult.error ?? 'The edit did not change anything.',
            code: 'failed',
          },
          timestamp: Date.now(),
        });
        return;
      }

      const rawSchema = workspace.readSchema();
      let composedSchema: OrbitalSchema | null = null;
      if (rawSchema !== null) {
        try {
          composedSchema = JSON.parse(rawSchema) as OrbitalSchema;
        } catch {
          // malformed schema — emit complete without it
        }
      }

      sendSSEEvent(res, {
        type: 'complete',
        data: {
          threadId,
          skill: 'rabit',
          workDir: workspace.workDir,
          schemaGenerated: composedSchema !== null,
          appCompiled: false,
          schemaPersisted: false,
          ...(composedSchema !== null ? { schema: composedSchema } : {}),
          ...(workspace.appId !== undefined ? { appId: workspace.appId } : {}),
        },
        timestamp: Date.now(),
      });

      if (composedSchema !== null) {
        try {
          await opts.onComplete?.(composedSchema, req);
        } catch {
          // best-effort
        }
      }
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || abortController.signal.aborted);
      if (isAbort) {
        sendSSEEvent(res, {
          type: 'cancelled',
          data: { threadId, message: 'Edit cancelled' },
          timestamp: Date.now(),
        });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        sendSSEEvent(res, {
          type: 'error',
          data: { error: message, code: 'runtime' },
          timestamp: Date.now(),
        });
      }
    } finally {
      try {
        unsubscribe();
      } catch {
        // best-effort
      }
      closeSSE(res);
    }
  };
}
