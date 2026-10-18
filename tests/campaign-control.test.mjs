import assert from 'node:assert/strict';
import {CampaignControl} from '../communications-engine/campaign-control.mjs';
// Serialized, rollback-capable storage double; production adapter is still required.
class Store {
  data = {}; tail = Promise.resolve();
  transaction(fn) {
    const result = this.tail.then(async () => {
      const draft = structuredClone(this.data);
      const value = await fn({get: async key => draft[key], put: async (key, value) => {draft[key] = value;}});
      this.data = draft; return value;
    });
    this.tail = result.catch(() => {}); return result;
  }
}
const quotedRates = {fixedMonthlyCents: 0, postcardAllInCents: 2500, callAllInMinuteCents: 35, maxCallSeconds: 180};
const store = new Store(), control = new CampaignControl(store, 'owner', quotedRates);
const draft = id => ({month: '2026-10', campaignId: id,
  recipients: [{leadId: 1, mailingAddress: 'Example address', addressReviewed: true, postcardRequested: true}],
  content: {postcardFront: 'front', postcardBack: 'back', callScript: 'script', voiceId: 'voice'},
  rates: {fixedMonthlyCents: 0, postcardAllInCents: 2500, callAllInMinuteCents: 35, maxCallSeconds: 180}});
const a = await control.submit('owner', draft('a'));
const tampered = draft('tampered'); tampered.rates.postcardAllInCents = 1;
assert.equal((await control.submit('owner', tampered)).plan.estimatedMaximumCents, 2500, 'request cannot lower server rates');
await assert.rejects(control.approve('other', 'a', a.plan.fingerprint), /authorization/);
await assert.rejects(control.approve('owner', 'a', a.plan.fingerprint), /paused/);
await control.pause('owner', false);
const b = await control.submit('owner', draft('b'));
const approvals = await Promise.allSettled([
  control.approve('owner', 'a', a.plan.fingerprint), control.approve('owner', 'b', b.plan.fingerprint)]);
assert.equal(approvals.filter(row => row.status === 'fulfilled').length, 1, 'concurrent approvals share the same $45 cap');
assert.equal(store.data['campaign-control'].months[0].reservedCents, 2500);
await control.approve('owner', 'a', a.plan.fingerprint);
assert.equal(store.data['campaign-control'].months[0].reservedCents, 2500, 'repeat approval is idempotent');
await assert.rejects(control.submit('owner', draft('a')), /Cancel/);
await control.cancel('owner', 'a'); await control.cancel('owner', 'a');
assert.equal(store.data['campaign-control'].months[0].reservedCents, 0, 'repeat cancellation does not release twice');
const changed = draft('a'); changed.content.postcardBack = 'revised';
const revised = await control.submit('owner', changed);
await assert.rejects(control.approve('owner', 'a', a.plan.fingerprint), /snapshot/);
await control.pause('owner');
await assert.rejects(control.approve('owner', 'a', revised.plan.fingerprint), /paused/);
assert.equal((await control.pause('owner')).liveExecutionEnabled, false);
console.log('Campaign owner approval, pause, and concurrent budget checks passed');
