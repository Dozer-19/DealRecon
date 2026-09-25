import assert from 'node:assert/strict';
import {securePhoneReconLookup} from '../phone-recon-worker/secure-client.mjs';
const endpoint = 'https://deal-recon-phone-recon-v3.example.workers.dev/';
const request = {owner: 'Example Owner', propertyAddress: '123 Test St'};
await assert.rejects(securePhoneReconLookup(request, {user: null, endpoint}), /Sign in/);
await assert.rejects(securePhoneReconLookup(request, {user: {getIdToken: async () => 'test'}, endpoint: 'http://unsafe/'}), /endpoint/);
let sent;
const candidates = await securePhoneReconLookup(request, {user: {getIdToken: async () => 'test-token'}, endpoint,
  fetchImpl: async (url, options) => {sent = {url, options}; return new Response(JSON.stringify({ok: true, candidates: []}), {status: 200});}});
assert.equal(sent.options.headers.Authorization, 'Bearer test-token');
assert.equal(sent.url, endpoint);
assert.deepEqual(candidates, []);
await assert.rejects(securePhoneReconLookup(request, {user: {getIdToken: async () => 'test'}, endpoint,
  fetchImpl: async () => new Response(JSON.stringify({ok: false, error: 'Contact lookup is paused'}), {status: 503})}), /paused/);
console.log('Phone Recon authenticated client checks passed');
