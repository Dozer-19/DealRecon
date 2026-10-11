const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
class Element {
  value = ''; checked = false; disabled = false; textContent = ''; dataset = {}; style = {}; children = [];
  append(child) {this.children.push(child);}
  replaceChildren() {this.children = [];}
}
(async () => {
  const elements = {};
  const doc = {getElementById: id => elements[id] ||= new Element(), createElement: () => new Element(),
    querySelectorAll: () => []};
  const plan = {month: '2026-10', estimatedMaximumCents: 125, postcardCount: 1, callCount: 0,
    fingerprint: 'exact', content: {postcardFront: '<script>test</script>', postcardBack: 'back'},
    recipients: [{channels: ['postcard'], mailingAddress: 'reviewed address'}], excluded: []};
  let requests = [], fail = false, paused = true;
  const window = {document: doc};
  const context = {window, document: doc, drAuth: {currentUser: {getIdToken: async () => 'token'}},
    get: () => [{id: 1}], fetch: async (url, options) => {
      requests.push({url, body: JSON.parse(options.body)});
      if (fail) throw Error('Offline');
      return {ok: true, json: async () => ({ok: true, liveExecutionEnabled: false,
        result: {paused, months: [], campaigns: [{id: 'a', status: 'awaiting-owner-review', plan}]}})};
    }};
  vm.runInNewContext(fs.readFileSync('app/src/main/assets/campaign-review-v3.js', 'utf8'), context);
  await window.crRefresh();
  let card = elements.crReviews.children[0];
  assert.equal(card.children[1].textContent.includes('<script>'), true, 'content rendered as plain text');
  assert.equal(card.children[3].disabled, true, 'pause disables approval');
  paused = false; await window.crRefresh(); card = elements.crReviews.children[0];
  await card.children[3].onclick();
  assert.equal(requests.find(row => row.url.endsWith('/approve')).body.fingerprint, 'exact');
  doc.getElementById('cmCampaign').value = 'c'; doc.getElementById('cmLead').value = '1';
  doc.getElementById('crAddress').value = 'address'; doc.getElementById('crFront').value = 'front';
  doc.getElementById('crBack').value = 'back';
  await window.crSubmitPostcard();
  assert.equal(requests.some(row => row.url.endsWith('/submit')), false, 'unreviewed address cannot submit');
  elements.crAddressReviewed.checked = true; await window.crSubmitPostcard();
  const submitted = requests.find(row => row.url.endsWith('/submit'));
  assert.equal(submitted.body.recipients[0].postcardRequested, true);
  assert.equal(submitted.body.recipients[0].callRequested, undefined);
  assert.equal(elements.crAddressReviewed.checked, false);
  fail = true; await window.crRefresh();
  assert.equal(elements.crReviews.children.length, 0, 'failure clears stale approval controls');
  assert.match(elements.crBudget.textContent, /unavailable/);
  console.log('Campaign review UI pause, snapshot, plain-text preview and destination checks passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
