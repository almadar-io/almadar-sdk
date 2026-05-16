/**
 * `AlmadarClient` — server / Node-side HTTP client targeting `/api/v1/agent/*`.
 * Authenticates with a team-bound API key (`sk_*`) issued from
 * Studio's `/settings/sdk` panel. See `docs/Almadar_Studio_SDK.md` §5.
 *
 * Never instantiate this in a browser bundle — `apiKey` must never leave
 * the customer's server.
 */

import type { OrbitalSchema } from '@almadar/core';
import type {
  AgentEvent,
  AlmadarClientOptions,
  ApiErrorBody,
  AsyncJobHandle,
  CompileOptions,
  CompileResult,
  EditSchemaPatch,
  GenerateOptions,
  GenerateResult,
} from '../types';
import { errorFromBody, ServerError } from './errors';
import { parseSSE } from './sseParser';

const DEFAULT_BASE_URL = 'https://api.almadar.io';
const POLL_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 10_000, 30_000];

interface JobStatus {
  state: 'pending' | 'complete' | 'error';
  events?: readonly AgentEvent[];
  result?: GenerateResult;
  errorCode?: number;
  errorMessage?: string;
}

export class AlmadarClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AlmadarClientOptions) {
    if (!opts.apiKey || typeof opts.apiKey !== 'string') {
      throw new Error('AlmadarClient: opts.apiKey is required');
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('AlmadarClient: no fetch available — pass opts.fetch for Node <18');
    }
  }

  async generate(input: GenerateOptions): Promise<GenerateResult> {
    if (input.async === true) {
      const handle = await this.requestJson<AsyncJobHandle>('POST', '/api/v1/agent/generate', {
        prompt: input.prompt,
        endUserId: input.endUserId,
        appId: input.appId,
        async: true,
      });
      assertString(handle.jobId, 'AsyncJobHandle.jobId');
      assertString(handle.statusUrl, 'AsyncJobHandle.statusUrl');
      return this.pollUntilComplete(handle, input.onEvent);
    }
    return this.streamGenerate(input);
  }

  async editSchema(appId: string, patch: EditSchemaPatch): Promise<OrbitalSchema> {
    if (!appId) throw new Error('AlmadarClient.editSchema: appId is required');
    const schema = await this.requestJson<OrbitalSchema>('PUT', '/api/v1/agent/edit-schema', {
      appId,
      patch,
    });
    assertString(schema.name, 'OrbitalSchema.name');
    return schema;
  }

  async compileToApp(schema: OrbitalSchema, opts?: CompileOptions): Promise<CompileResult> {
    const result = await this.requestJson<CompileResult>('POST', '/api/v1/agent/compile', {
      schema,
      target: opts?.target,
      shell: opts?.shell,
    });
    assertString(result.downloadUrl, 'CompileResult.downloadUrl');
    assertString(result.expiresAt, 'CompileResult.expiresAt');
    return result;
  }

  private async streamGenerate(input: GenerateOptions): Promise<GenerateResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v1/agent/generate`, {
      method: 'POST',
      headers: this.headers({ accept: 'text/event-stream', contentType: 'application/json' }, input.endUserId),
      body: JSON.stringify({
        prompt: input.prompt,
        endUserId: input.endUserId,
        appId: input.appId,
      }),
    });
    if (!res.ok) throw await this.errorFromResponse(res);
    if (res.body === null) throw new Error('AlmadarClient.generate: server returned no body');

    let final: GenerateResult | null = null;
    for await (const raw of parseSSE(res.body)) {
      const event = parseAgentEvent(raw.event, raw.data);
      if (event === null) continue;
      input.onEvent?.(event);
      if (event.type === 'complete') {
        final = { schema: event.schema, appId: event.appId };
      } else if (event.type === 'error') {
        throw errorFromBody({ code: event.code ?? 500, message: event.message });
      }
    }
    if (final === null) {
      throw new ServerError({ code: 500, message: 'SSE stream ended without `complete` event' });
    }
    return final;
  }

  private async pollUntilComplete(
    handle: AsyncJobHandle,
    onEvent: GenerateOptions['onEvent'],
  ): Promise<GenerateResult> {
    let attempt = 0;
    for (;;) {
      const delay = POLL_BACKOFF_MS[Math.min(attempt, POLL_BACKOFF_MS.length - 1)];
      await sleep(delay);
      attempt += 1;
      const status = await this.requestJson<JobStatus>('GET', handle.statusUrl);
      assertString(status.state, 'JobStatus.state');
      if (status.events !== undefined && onEvent !== undefined) {
        for (const e of status.events) onEvent(e);
      }
      if (status.state === 'complete') {
        if (status.result === undefined) {
          throw new ServerError({ code: 500, message: 'Job complete but no result returned' });
        }
        return status.result;
      }
      if (status.state === 'error') {
        throw errorFromBody({
          code: status.errorCode ?? 500,
          message: status.errorMessage ?? 'Job failed',
        });
      }
    }
  }

  private async requestJson<T>(method: string, path: string, body?: object): Promise<T> {
    const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
    const url = isAbsolute ? path : `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers({
        accept: 'application/json',
        contentType: body !== undefined ? 'application/json' : undefined,
      }),
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await this.fetchImpl(url, init);
    if (!res.ok) throw await this.errorFromResponse(res);
    const text = await res.text();
    if (text === '') {
      throw new ServerError({ code: 500, message: 'Empty response body' });
    }
    const parsed: T = JSON.parse(text);
    return parsed;
  }

  private headers(
    opts: { accept?: string; contentType?: string },
    endUserId?: string,
  ): Record<string, string> {
    const h: Record<string, string> = { authorization: `Bearer ${this.apiKey}` };
    if (opts.accept !== undefined) h['accept'] = opts.accept;
    if (opts.contentType !== undefined) h['content-type'] = opts.contentType;
    if (endUserId !== undefined && endUserId !== '') h['x-end-user-id'] = endUserId;
    return h;
  }

  private async errorFromResponse(res: Response): Promise<Error> {
    const text = await res.text();
    let body: ApiErrorBody;
    try {
      const parsed: ApiErrorBody | null = text === '' ? null : JSON.parse(text);
      body = parsed !== null && typeof parsed.code === 'number' && typeof parsed.message === 'string'
        ? parsed
        : {
            code: res.status,
            message: res.statusText !== '' ? res.statusText : 'HTTP error',
          };
    } catch {
      body = { code: res.status, message: text !== '' ? text : res.statusText };
    }
    const retryAfter = res.headers.get('retry-after');
    const err = errorFromBody(body);
    if (err.name === 'RateLimitedError' && retryAfter !== null) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) {
        Object.defineProperty(err, 'retryAfterSeconds', { value: seconds, enumerable: true });
      }
    }
    return err;
  }
}

function parseAgentEvent(eventName: string, dataLine: string): AgentEvent | null {
  if (dataLine === '') return null;
  let payload: AgentEvent | null;
  try {
    payload = JSON.parse(dataLine);
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== 'object') return null;
  if (typeof payload.type === 'string') return payload;
  if (eventName === '') return null;
  // Server sent only an `event:` field name — write `type` onto the payload.
  // Mutating the parsed result is safe because we own it.
  const synthesized: AgentEvent & { type: string } = Object.assign(payload, { type: eventName });
  return synthesized;
}

function assertString(v: string | undefined, name: string): asserts v is string {
  if (typeof v !== 'string' || v === '') {
    throw new ServerError({ code: 500, message: `Malformed server response: ${name} is not a string` });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
