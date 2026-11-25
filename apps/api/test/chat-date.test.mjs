import test from 'node:test';
import assert from 'node:assert/strict';
import {dateParts} from '../dist/ai/chat-date.js';

test('booking corrections use the clinic calendar and accept both hour formats',()=>{
  for(const text of ['marque as consulta para as 14h do dia 23/11','marque para as 14 do dia 23/11']){
    const parts=dateParts(text,'2026-11-22');
    assert.equal(parts.day,'2026-11-23');
    assert.equal(parts.time,'14:00');
  }
  assert.equal(dateParts('01/01','2026-12-31').day,'2027-01-01');
  assert.equal(dateParts('31/02','2026-11-22').invalidDate,true);
});
