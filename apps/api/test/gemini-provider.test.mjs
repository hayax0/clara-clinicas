import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { test } from 'node:test';
import { createGeminiProvider } from '../src/ai/gemini-provider.ts';

const request = {
  tier: 'standard',
  instructions: 'Use dados sintéticos.',
  turns: [{ role: 'user', text: 'Responda OK.' }],
  tools: [],
  timeoutMs: 1_800,
  maxOutputTokens: 32,
};
const env = { GEMINI_API_KEY: 'synthetic-test-key' };

function success(text = 'OK', finishReason = 'STOP') {
  return Response.json({
    modelVersion: 'gemini-fixture',
    candidates: [{ content: { parts: [{ text: 'interno', thought: true }, { text }] }, finishReason }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1, thoughtsTokenCount: 6 },
  });
}

function httpError(status, headers) {
  return Response.json({ error: { code: status, message: 'fixture' } }, { status, headers });
}

test('a missing key does not initialize a network request', async () => {
  const provider = createGeminiProvider({ GOOGLE_API_KEY: 'not-clara' }, () => assert.fail('unexpected network request'));
  assert.deepEqual(await provider.generate(request), { status: 'unavailable', reason: 'missing_configuration' });
});

test('invalid model configuration cannot issue an HTTP request', async () => {
  const provider = createGeminiProvider({ ...env, GEMINI_MODEL_STANDARD: 'https://example.test' }, () => assert.fail());
  assert.deepEqual(await provider.generate(request), { status: 'unavailable', reason: 'invalid_configuration' });
});

test('official SDK sends the configured model and returns structured output with usage', async () => {
  const provider = createGeminiProvider({ ...env, GEMINI_MODEL_ADVANCED: 'gemini-test-model' }, (url, options) => {
    assert.equal(new URL(url).origin, 'https://generativelanguage.googleapis.com');
    assert.match(new URL(url).pathname, /gemini-test-model:generateContent$/);
    assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'synthetic-test-key');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.contents[0].parts[0].text, 'Responda OK.');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(body.generationConfig.maxOutputTokens, 32);
    return success('{"status":"ok"}');
  });

  const result = await provider.generate({
    ...request,
    tier: 'advanced',
    outputSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.output, { kind: 'structured', value: { status: 'ok' } });
  assert.equal(result.usage.inputTokens, 12);
  assert.equal(result.usage.outputTokens, 1);
  assert.equal(result.usage.thinkingTokens, 6);
});

test('transient responses retry within the attempt budget', async () => {
  let attempts = 0;
  const provider = createGeminiProvider(env, () => ++attempts <= 2 ? httpError(503) : success());
  const result = await provider.generate(request);
  assert.equal(attempts, 3);
  assert.deepEqual(result.output, { kind: 'text', text: 'OK' });
});

test('Retry-After clips retries to the execution deadline', async () => {
  let attempts = 0;
  const provider = createGeminiProvider(env, () => {
    attempts++;
    return httpError(429, { 'Retry-After': '60' });
  });
  const result = await provider.generate(request);
  assert.equal(attempts, 1);
  assert.equal(result.reason, 'rate_limit');
  assert.equal(result.retryable, true);
});

test('permanent errors do not retry or expose the upstream error body', async () => {
  let attempts = 0;
  const provider = createGeminiProvider(env, () => { attempts++; return httpError(403); });
  const result = await provider.generate(request);
  assert.equal(attempts, 1);
  assert.equal(result.reason, 'provider_error');
  assert.equal(result.retryable, false);
  assert.doesNotMatch(JSON.stringify(result), /fixture|synthetic-test-key/);
});

test('deadline aborts the HTTP request', async () => {
  let attempts = 0;
  const provider = createGeminiProvider(env, async (_url, options) => {
    attempts++;
    await wait(300, undefined, { signal: options.signal });
    assert.fail('the request was not cancelled');
  });
  const result = await provider.generate({ ...request, timeoutMs: 80 });
  assert.equal(attempts, 1);
  assert.equal(result.reason, 'timeout');
});

test('a truncated response is rejected and tool requests remain unavailable at this stage', async () => {
  const provider = createGeminiProvider(env, () => success('partial', 'MAX_TOKENS'));
  const partial = await provider.generate(request);
  assert.equal(partial.reason, 'invalid_response');
  assert.equal(partial.retryable, false);
  const tool = await provider.generate({ ...request, tools: [{ name: 'test', description: 'Test', inputSchema: {} }] });
  assert.equal(tool.reason, 'unsupported_request');
});
