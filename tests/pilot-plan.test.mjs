import assert from 'node:assert/strict';
import {buildPilotPlan} from '../communications-engine/pilot-plan.mjs';
const input = {month: '2026-10', campaignId: 'pilot', content: {postcardFront: 'Property options',
  postcardBack: 'Contact Ken', callScript: 'I am an AI assistant for Ken.', voiceId: 'preview-required'},
  rates: {fixedMonthlyCents: 200, postcardAllInCents: 125, callAllInMinuteCents: 35, maxCallSeconds: 180},
  recipients: [{leadId: 1, phone: '8565550100', callRequested: true, callConsentReviewed: true,
    callConsentEvidence: 'Reviewed signed record reference', postcardRequested: true, addressReviewed: true,
    mailingAddress: '123 Example St, Example NJ 08000'}]};
const plan = buildPilotPlan(input);
assert.equal(plan.estimatedMaximumCents, 430);
assert.equal(plan.withinBudget, true);
assert.equal(plan.liveExecutionEnabled, false);
assert.equal(plan.status, 'awaiting-owner-review');
assert.equal(buildPilotPlan({...input, spentCents: 4200}).withinBudget, false);
assert.equal(buildPilotPlan({...input, reservedCents: 4200}).withinBudget, false);
assert.equal(buildPilotPlan({...input, recipients: [...input.recipients, {...input.recipients[0], leadId: 2}]}).callCount, 1);
assert.equal(buildPilotPlan({...input, recipients: [...input.recipients, {...input.recipients[0], leadId: 2}]}).postcardCount, 1);
const suppressed = buildPilotPlan({...input, recipients: [{...input.recipients[0], dnc: true, mailOptOut: true}]});
assert.equal(suppressed.recipients.length, 0);
assert.equal(buildPilotPlan({...input, recipients: [{...input.recipients[0], callConsentReviewed: false}]}).callCount, 0);
assert.notEqual(buildPilotPlan({...input, content: {...input.content, callScript: 'Changed'}}).fingerprint, plan.fingerprint);
assert.throws(() => buildPilotPlan({...input, rates: {...input.rates, maxCallSeconds: Infinity}}));
assert.throws(() => buildPilotPlan({...input, spentCents: -1}));
console.log('Pilot review planner checks passed; live execution disabled');
