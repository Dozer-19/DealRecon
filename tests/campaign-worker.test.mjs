import assert from 'node:assert/strict';
import {handleCampaignRequest, CampaignControlObject} from '../communications-worker/index.mjs';
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
const storage = new Store();
const env = {CAMPAIGN_OWNER_UID: 'owner', CAMPAIGN_QUOTED_RATES: JSON.stringify({
  fixedMonthlyCents: 0, postcardAllInCents: 100, callAllInMinuteCents: 35, maxCallSeconds: 180})};
let object = new CampaignControlObject({storage}, env), calls = 0;
env.CAMPAIGN_CONTROL = {idFromName: name => name, get: () => ({fetch: (url, init) => {
  calls++; return object.fetch(new Request(url, init));}})};
const req = (path, body = {}, token = 'owner', origin = 'null') => new Request('https://test.local' + path, {
  method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token, Origin: origin},
  body: JSON.stringify(body)});
const deps = {verifyToken: async token => {if (token === 'invalid') throw Error(); return {sub: token};}};
assert.equal((await handleCampaignRequest(req('/status', {}, 'invalid'), env, deps)).status, 401);
assert.equal((await handleCampaignRequest(req('/status', {}, 'other'), env, deps)).status, 403);
assert.equal((await handleCampaignRequest(req('/status', {}, 'owner', 'https://evil.test'), env, deps)).status, 403);
assert.equal(calls, 0, 'unauthorized traffic never reaches storage');
let status = await (await handleCampaignRequest(req('/status'), env, deps)).json();
assert.equal(status.result.paused, true);
assert.equal((await handleCampaignRequest(req('/dispatch'), env, deps)).status, 404);
const draft = {month: '2026-10', campaignId: 'test',
  recipients: [{leadId: '1', mailingAddress: 'Example address', addressReviewed: true, postcardRequested: true}],
  content: {postcardFront: 'front', postcardBack: 'back', callScript: 'script', voiceId: 'voice'},
  rates: {postcardAllInCents: 1}};
const submitted = await (await handleCampaignRequest(req('/submit', draft), env, deps)).json();
assert.equal(submitted.result.plan.estimatedMaximumCents, 100);
await handleCampaignRequest(req('/pause', {paused: false}), env, deps);
const approval = {campaignId: 'test', fingerprint: submitted.result.plan.fingerprint};
assert.equal((await handleCampaignRequest(req('/approve', approval), env, deps)).status, 200);
// Recreate the object, preserving storage to model restart recovery.
object = new CampaignControlObject({storage}, env);
status = await (await handleCampaignRequest(req('/status'), env, deps)).json();
assert.equal(status.result.months[0].reservedCents, 100);
assert.equal(status.liveExecutionEnabled, false);
await handleCampaignRequest(req('/cancel', {campaignId: 'test'}), env, deps);
status = await (await handleCampaignRequest(req('/status'), env, deps)).json();
assert.equal(status.result.months[0].reservedCents, 0);
const noQuotes = new CampaignControlObject({storage}, {CAMPAIGN_OWNER_UID: 'owner'});
assert.equal((await noQuotes.fetch(new Request('https://internal/status', {
  method: 'POST', body: JSON.stringify({actorUid: 'owner'})}))).status, 200);
assert.equal((await noQuotes.fetch(new Request('https://internal/submit', {
  method: 'POST', body: JSON.stringify({actorUid: 'owner', body: draft})}))).status, 409);
const emailEnv = {CAMPAIGN_OWNER_EMAIL: 'owner@example.test'};
const emailObject = new CampaignControlObject({storage: new Store()}, emailEnv);
emailEnv.CAMPAIGN_CONTROL = {idFromName: name => name, get: () => ({fetch: (url, init) => emailObject.fetch(new Request(url, init))})};
const verified = {verifyToken: async () => ({sub: 'email-owner', email: 'owner@example.test', email_verified: true})};
assert.equal((await handleCampaignRequest(req('/status'), emailEnv, verified)).status, 200);
assert.equal((await handleCampaignRequest(req('/status'), emailEnv, {
  verifyToken: async () => ({sub: 'attacker', email: 'owner@example.test', email_verified: false})})).status, 403);
assert.equal((await handleCampaignRequest(req('/status', {verifiedOwnerEmail: 'owner@example.test'}), emailEnv, {
  verifyToken: async () => ({sub: 'attacker', email: 'other@example.test', email_verified: true})})).status, 403);
console.log('Authenticated review routes, durable adapter contract and disabled dispatch checks passed');
