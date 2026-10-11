const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const leads = [];
let imported;
const context = {window: {}, document: {getElementById: () => null},
  get: () => leads, set: (_, value) => { imported = value; }, renderAll() {},
  leadReconScore: () => 0, leadReconLabel: () => 'NURTURE',
  FileReader: class { readAsText() { this.result = 'Owner Name,Property Address,Mailing Address,Parcel ID,Phone\n"Owner, Jane",123 Test St,"PO Box 1, Test NJ",P1,5551234567'; this.onload(); } }};
vm.createContext(context);
vm.runInContext(fs.readFileSync('app/src/main/assets/lead-recon-sourcing.js', 'utf8'), context);
const w = context.window;
const parsed = w.parseLeadReconCSV('\uFEFFowner_name,phone,mailing_address\r\n"Owner, Jane",,"PO Box 1, NJ"');
assert.equal(parsed[0].phone, '');
assert.equal(parsed[0].mailing_address, 'PO Box 1, NJ');
assert.equal(w.parseLeadReconCSV('owner_name\n"A ""quoted"" name"')[0].owner_name, 'A "quoted" name');
assert.throws(() => w.parseLeadReconCSV('owner_name\n"unfinished'));
w.importLeadSourceCSV({target: {files: [{}]}});
assert.equal(imported[0].name, 'Owner, Jane');
assert.equal(imported[0].mail, 'PO Box 1, Test NJ');
assert.equal(imported[0].parcelId, 'P1');
assert.equal(imported[0].phone, '5551234567');
const record = w.normalizeNJLead({PAMS_PIN:'P1', COUNTY:'GLOUCESTER', PROP_LOC:'123 Test St', MUN_NAME:'TEST', ST_ADDRESS:'PO Box 1', CITY_STATE:'TEST NJ', ZIP_CODE:'08000'});
assert.equal(record.ownerName, '');
assert.equal(record.propertyAddress, '123 Test St, TEST, NJ');
assert.equal(record.mailingAddress, 'PO Box 1, TEST NJ, 08000');
assert.match(w.renderNJCandidate(record), /statewide data omits owner names/);
assert.match(w.renderNJCandidate(record), /gloucestercountynj.gov/);
console.log('Lead CSV field alignment, contact preservation and redacted-owner checks passed');
