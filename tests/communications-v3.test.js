const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ids = ['cmLead','cmCampaign','cmLetter','cmOutcome','cmCallNotes','cmTemplate','cmMailCost',
  'cmName','cmBudget','cmCampaignList','cmDue','cmTask','cmFollowups','cmConversion','cmRevenue',
  'cmMetrics','cmActivity'];
const nodes = Object.fromEntries(ids.map(key => [key, {value: '', innerHTML: '', textContent: ''}]));
const storage = {owners: [{id: 2, name: 'New Owner', prop: '12 Oak St', mail: 'PO Box 22'}], leads: [{id: 12, name: 'Owner', prop: '123 Main', phone: '8565550100',
  mailingAddress: 'PO Box 5', dnc: 'Unknown'}]};
const context = {document: {getElementById: id => nodes[id]},
  get: key => structuredClone(storage[key] || []), set: (key, value) => {storage[key] = structuredClone(value)},
  esc: value => String(value ?? '').replaceAll('<', '&lt;'), money: value => '$' + value,
  window: {confirm: () => true}, go: () => {}, renderAll: () => {}, console, Date, Math};
vm.createContext(context);
vm.runInContext(fs.readFileSync('app/src/main/assets/communications-v3.js', 'utf8'), context);
nodes.cmLead.value = '12';
nodes.cmName.value = 'Owner outreach';
context.window.cmAddCampaign();
assert.equal(storage.commCampaigns.length, 1);
nodes.cmCampaign.value = String(storage.commCampaigns[0].id);
nodes.cmOutcome.value = 'Attempted';
context.window.cmLogCall();
assert.equal(storage.commActivity[0].kind, 'call');
assert.equal(storage.commFollowups.length, 1);
nodes.cmTemplate.value = 'absentee';
context.window.cmDraftMail();
assert.match(nodes.cmLetter.textContent, /123 Main/);
nodes.cmMailCost.value = '1.25';
context.window.cmLogMail();
assert.equal(storage.commActivity[0].cost, 1.25);
nodes.cmConversion.value = 'Client';
nodes.cmRevenue.value = '5000';
context.window.cmLogConversion();
assert.match(nodes.cmMetrics.innerHTML, /Client conversion/);
assert.match(nodes.cmMetrics.innerHTML, /5000/);
storage.leads[0].dnc = 'Do Not Call';
const before = storage.commActivity.length;
context.window.cmLogCall();
assert.equal(storage.commActivity.length, before);
context.window.cmOpenOwner(2);
assert.equal(storage.leads.length, 2);
assert.equal(nodes.cmLead.value, String(storage.leads[0].id));
context.window.cmOpenOwner(2);
assert.equal(storage.leads.length, 2, 'owner handoff must not duplicate lead');
context.window.cmOptOutMail();
assert.equal(storage.leads[0].mailOptOut, true);
const mailCount = storage.commActivity.length;
context.window.cmLogMail();
assert.equal(storage.commActivity.length, mailCount, 'opted-out lead must not log a mailing');
console.log('Communications workflow checks passed');
