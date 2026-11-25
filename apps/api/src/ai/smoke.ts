import '../config.js';
import { createGeminiProvider } from './gemini-provider.js';

const result = await createGeminiProvider().generate({
  tier: 'standard',
  instructions: 'Responda somente com OK.',
  turns: [{ role: 'user', text: 'Teste sintético do adaptador Gemini. Responda OK.' }],
  tools: [],
  maxOutputTokens: 512,
  timeoutMs: 15_000,
});

if (result.status !== 'completed') {
  process.stderr.write(`Gemini: ${result.status} (${result.reason}).\n`);
  process.exitCode = 1;
} else if (result.output.kind !== 'text' || result.output.text.trim() !== 'OK') {
  process.stderr.write('Gemini respondeu, mas o teste não recebeu o texto esperado.\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`Gemini validado com dados sintéticos: ${result.usage.modelId} (${result.usage.latencyMs} ms).\n`);
}
