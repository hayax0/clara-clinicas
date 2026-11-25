import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consultationBody, consultationIntents, consultations, planRequest, proposedTool } from '../src/ai/assistant-plan.ts';

test('the model receives fixed prompts with no chat, identifiers, or database results', () => {
  assert.equal(consultationBody.safeParse({ intent: 'open_tasks', text: 'Paciente de teste' }).success, false);
  assert.equal(consultationBody.safeParse({ intent: 'open_tasks', organizationId: 'other' }).success, false);
  for (const intent of consultationIntents) {
    const request = planRequest(intent);
    assert.deepEqual(request.turns, [{ role: 'user', text: consultations[intent].instruction }]);
    assert.deepEqual(request.tools, []);
    assert.ok(request.outputSchema.properties.tool.enum.includes(intent));
  }
});

test('only the requested and parameterless tool proposal can be executed', () => {
  assert.equal(proposedTool({ tool: 'agenda_today' }, 'agenda_today'), 'agenda_today');
  for (const proposal of [
    { tool: 'clinic_metrics' },
    { tool: 'arbitrary_command' },
    { tool: 'agenda_today', arguments: { organizationId: 'foreign-clinic' } },
    null,
  ]) assert.equal(proposedTool(proposal, 'agenda_today'), undefined);
});
