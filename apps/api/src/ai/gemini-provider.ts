import { ApiError, GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import type { ModelProvider, ModelRequest, ModelResult, ModelUsage } from '@clinicas/ai-core';
import { setTimeout as wait } from 'node:timers/promises';

const defaultModels = {
  standard: 'gemini-3.8-flash',
  advanced: 'gemini-3.8-flash',
};

const geminiEndpoint = 'https://generativelanguage.googleapis.com';
export const geminiMaxAttempts = 3;
const maxAttemptMs = 8_000;
const maxTotalMs = 30_000;
const GEMINI_MODEL_ID = /^gemini-[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');

function configuredModel(value: string | undefined, fallback: string) {
  const model = value?.trim() || fallback;
  return GEMINI_MODEL_ID.test(model) ? model : null;
}

function retryDelay(header: string | null) {
  if (!header) return 0;
  if (/^\d+$/.test(header)) return Number(header) * 1_000;
  return Math.max(0, Date.parse(header) - Date.now()) || 0;
}

function googleRetryDelay(error: unknown) {
  if (!(error instanceof ApiError)) return 0;
  try {
    const payload = JSON.parse(error.message);
    const delay = payload.error?.details?.find((detail: { '@type': string }) =>
      detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo')?.retryDelay;
    return typeof delay === 'string' && /^\d+(\.\d+)?s$/.test(delay) ? Number.parseFloat(delay) * 1_000 : 0;
  } catch {
    return 0;
  }
}

type Failure = Extract<ModelResult, { status: 'failed' }>;

function classify(error: unknown, timedOut: boolean, networkError: boolean): Failure {
  const status = error instanceof ApiError ? error.status : undefined;
  if (timedOut || status === 408 || status === 504) return { status: 'failed', reason: 'timeout', retryable: true };
  if (status === 429) return { status: 'failed', reason: 'rate_limit', retryable: true };
  return { status: 'failed', reason: 'provider_error', retryable: networkError || [500, 502, 503].some((code) => code === status) };
}

function readResponse(response: GenerateContentResponse, request: ModelRequest, usage: ModelUsage): ModelResult {
  const candidate = response.candidates?.[0];
  const text = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? '').join('');
  if (candidate?.finishReason === 'STOP' && text?.trim()) {
    if (!request.outputSchema) return { status: 'completed', output: { kind: 'text', text }, usage };
    try {
      return { status: 'completed', output: { kind: 'structured', value: JSON.parse(text) }, usage };
    } catch {
      // The upstream schema contract still requires parseable JSON.
    }
  }
  return { status: 'failed', reason: 'invalid_response', retryable: false, usage };
}

export interface GeminiProvider extends ModelProvider {
  readonly standardAvailable: boolean;
}

export function createGeminiProvider(env: NodeJS.ProcessEnv = process.env, fetchTransport: typeof fetch = fetch): GeminiProvider {
  const apiKey = env.GEMINI_API_KEY?.trim();
  const models = {
    standard: configuredModel(env.GEMINI_MODEL_STANDARD, defaultModels.standard),
    advanced: configuredModel(env.GEMINI_MODEL_ADVANCED, defaultModels.advanced),
  };
  const client = apiKey ? new GoogleGenAI({ apiKey, vertexai: false, httpOptions: { baseUrl: geminiEndpoint } }) : undefined;

  return {
    standardAvailable: Boolean(client && models.standard),
    async generate(request) {
      if (!client) return { status: 'unavailable', reason: 'missing_configuration' };
      const model = models[request.tier];
      if (!model) return { status: 'unavailable', reason: 'invalid_configuration' };
      const contents = request.turns.flatMap((turn) =>
        turn.role === 'tool' || (turn.role === 'model' && (turn.toolProposals?.length || !turn.text))
          ? [] : [{ role: turn.role, parts: [{ text: turn.text }] }],
      );
      if (request.tools.length || !contents.length || contents.length !== request.turns.length
        || !Number.isSafeInteger(request.timeoutMs) || request.timeoutMs <= 0
        || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0) {
        return { status: 'failed', reason: 'unsupported_request', retryable: false };
      }

      const startedAt = performance.now();
      const deadline = startedAt + Math.min(request.timeoutMs, maxTotalMs);
      const elapsed = () => Math.round(performance.now() - startedAt);
      let attempts = 0;
      let failure: Failure = { status: 'failed', reason: 'timeout', retryable: true };
      for (let attempt = 1; attempt <= geminiMaxAttempts; attempt++) {
        const remaining = Math.floor(deadline - performance.now());
        if (remaining <= 0) break;
        const abortSignal = AbortSignal.timeout(Math.min(remaining, maxAttemptMs));
        let retryAfter = 0;
        let networkError = false;
        try {
          const response = await client.models.generateContent({
            model,
            contents,
            config: {
              abortSignal,
              systemInstruction: request.instructions,
              maxOutputTokens: request.maxOutputTokens,
              automaticContinuation: false,
              ...(request.outputSchema && {
                responseMimeType: 'application/json',
                responseJsonSchema: request.outputSchema,
              }),
              httpOptions: {
                retryOptions: { attempts: 1 },
                fetch: async (url, options) => {
                  try {
                    attempts++;
                    const result = await fetchTransport(url, { ...options, redirect: 'error' });
                    retryAfter = retryDelay(result.headers.get('retry-after'));
                    return result;
                  } catch (error) {
                    networkError = error instanceof TypeError;
                    throw error;
                  }
                },
              },
            },
          });
          const metadata = response.usageMetadata;
          return readResponse(response, request, {
            modelId: response.modelVersion || model,
            latencyMs: elapsed(),
            attempts,
            inputTokens: metadata?.promptTokenCount,
            outputTokens: metadata?.candidatesTokenCount,
            thinkingTokens: metadata?.thoughtsTokenCount,
            cachedInputTokens: metadata?.cachedContentTokenCount,
          });
        } catch (error) {
          failure = classify(error, abortSignal.aborted, networkError);
          const backoff = 150 * 2 ** (attempt - 1) + Math.random() * 100;
          const delay = Math.max(retryAfter, googleRetryDelay(error), backoff);
          if (!failure.retryable || attempt === geminiMaxAttempts || performance.now() + delay >= deadline) break;
          await wait(delay);
        }
      }
      return { ...failure, usage: { modelId: model, latencyMs: elapsed(), attempts } };
    },
  };
}
