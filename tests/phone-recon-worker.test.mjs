import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleRequest, PhoneReconQuota, verifyFirebaseIdToken} from '../phone-recon-worker/index.mjs';
import {enrichContact} from '../phone-recon-worker/enformion.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const pair = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
const jwk = {...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256'};
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
async function token(claims = {}) {
  const header = encode({alg: 'RS256', kid: 'test-key', typ: 'JWT'});
  const payload = encode({aud: 'deal-recon', iss: 'https://securetoken.google.com/deal-recon',
    sub: 'approved-user', exp: now + 3600, iat: now - 10, auth_time: now - 100, ...claims});
  const signed = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey,
    new TextEncoder().encode(header + '.' + payload))).toString('base64url');
  return `${header}.${payload}.${signed}`;
}
const fetchKeys = async () => new Response(JSON.stringify({keys: [jwk]}),
  {headers: {'cache-control': 'max-age=60'}});
assert.equal((await verifyFirebaseIdToken(await token(), fetchKeys)).sub, 'approved-user');
await assert.rejects(verifyFirebaseIdToken(await token({aud: 'other'}), fetchKeys));
await assert.rejects(verifyFirebaseIdToken(await token({exp: now - 1}), fetchKeys));
{ const parts = (await token()).split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  await assert.rejects(verifyFirebaseIdToken(parts.join('.'), fetchKeys)); }
const body = JSON.stringify({owner: 'Test Owner', propertyAddress: '123 Test St'});
const request = (auth, content = body) => new Request('https://worker.test/', {method: 'POST',
  headers: {'Content-Type': 'application/json', ...(auth ? {Authorization: 'Bearer ' + auth} : {})}, body: content});
const env = {ALLOWED_FIREBASE_UIDS: 'approved-user', LOOKUPS_ENABLED: 'false'};
assert.equal((await handleRequest(request(null), env, {fetchKeys})).status, 401);
assert.equal((await handleRequest(request(await token({sub: 'outsider'})), env, {fetchKeys})).status, 403);
assert.equal((await handleRequest(request(await token()), env, {fetchKeys})).status, 503);
assert.equal((await handleRequest(request(await token(), 'invalid json'), env, {fetchKeys})).status, 503,
  'disabled gate must reject before processing lookup');
const counters = new Map();
const ctx = {storage: {transaction: async callback => callback({
  get: async key => counters.get(key), put: async (key, value) => counters.set(key, value)})}};
const gate = new PhoneReconQuota(ctx);
const consume = () => gate.fetch(new Request('https://quota.local/consume', {method: 'POST',
  body: JSON.stringify({uid: 'approved-user', maxDaily: 2, maxMonthly: 3})}));
assert.equal((await consume()).status, 204);
assert.equal((await consume()).status, 204);
assert.equal((await consume()).status, 429);
counters.clear();
const sample = {owner: 'OWNER, JANE', propertyAddress: '123 Test St, Camden, NJ 08102',
  mailingAddress: '123 Test St, Camden, NJ 08102'};
let calls = 0;
const mockProvider = async (url, options) => {
  calls++;
  assert.equal(url, 'https://devapi.enformion.com/Contact/Enrich');
  assert.equal(options.headers['galaxy-ap-password'], 'server-only-password');
  assert.equal(JSON.parse(options.body).FirstName, 'JANE');
  return new Response(JSON.stringify({identityScore: 92, person: {
    name: {firstName: 'Jane', lastName: 'Owner'},
    phones: [{number: '5551234567', type: 'mobile', isConnected: true}],
    emails: [{email: 'jane@example.test', isValidated: true}],
    addresses: [{street: '123 Test St', city: 'Camden', state: 'NJ', zip: '08102'}]}}));
};
const configured = {...env, LOOKUPS_ENABLED: 'true', ENFORMION_AP_NAME: 'server-only-name',
  ENFORMION_AP_PASSWORD: 'server-only-password', MAX_DAILY_LOOKUPS: '2', MAX_MONTHLY_LOOKUPS: '3',
  PHONE_RECON_QUOTA: {idFromName: () => 'workspace', get: () => ({
    fetch: (url, options) => gate.fetch(new Request(url, options))})}};
const signed = await token();
const send = () => handleRequest(request(signed, JSON.stringify(sample)), configured,
  {fetchKeys, fetchProvider: mockProvider});
assert.equal((await handleRequest(request(null), configured, {fetchKeys, fetchProvider: mockProvider})).status, 401);
const first = await send();
assert.equal(first.status, 200, await first.clone().text());
assert.equal((await first.json()).candidates[0].phone, '5551234567');
assert.equal((await send()).status, 200);
assert.equal((await send()).status, 429);
assert.equal(calls, 2, 'rejected requests never reach paid provider');
assert.equal((await enrichContact(sample, configured, mockProvider)).candidates[0].ownerMatch, true);
console.log('Phone Recon worker security checks passed');
