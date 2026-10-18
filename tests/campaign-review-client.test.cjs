const assert = require('node:assert/strict');
const {CampaignReviewClient} = require('../app/src/main/assets/campaign-review-v3.js');
(async () => {
  let requests = [];
  const client = new CampaignReviewClient(() => ({currentUser: {getIdToken: async () => 'test-token'}}), async (url, options) => {
    requests.push({url, options}); return {ok: true, json: async () => ({ok: true, result: {paused: true}, liveExecutionEnabled: false})};
  });
  assert.deepEqual(await client.request('status'), {paused: true});
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
  await client.request('approve', {campaignId: 'a', fingerprint: 'reviewed'});
  assert.deepEqual(JSON.parse(requests[1].options.body), {campaignId: 'a', fingerprint: 'reviewed'});
  await assert.rejects(client.request('dispatch'), /unavailable/);
  assert.equal(requests.length, 2);
  const unsigned = new CampaignReviewClient(() => null, () => {throw Error('must not fetch');});
  await assert.rejects(unsigned.request('status'), /Sign in/);
  const rejected = new CampaignReviewClient(() => ({currentUser: {getIdToken: async () => 'token'}}), async () => ({
    ok: false, json: async () => ({error: 'Owner authorization required'})}));
  await assert.rejects(rejected.request('approve'), /authorization/);
  const unexpected = new CampaignReviewClient(() => ({currentUser: {getIdToken: async () => 'token'}}), async () => ({
    ok: true, json: async () => ({ok: true, liveExecutionEnabled: true})}));
  await assert.rejects(unexpected.request('status'), /configuration/);
  console.log('Campaign review client authentication, exact approval and fail-closed checks passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
