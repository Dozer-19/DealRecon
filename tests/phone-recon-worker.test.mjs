import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleRequest, PhoneReconQuota, verifyFirebaseIdToken} from '../phone-recon-worker/index.mjs';
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
await assert.rejects(verifyFirebaseIdToken((await token()).replace(/.$/, 'x'), fetchKeys));
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
console.log('Phone Recon worker security checks passed');
