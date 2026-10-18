const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const element = () => ({value:'', children:[], appendChild(x){this.children.push(x);}, replaceChildren(){this.children=[];}});
for (const id of ['phOwner','phProp','phoneReconCandidates','phoneReconResult','cmLetter']) elements.set(id, element());
let network = 0, shared = '';
const context = {window:{DealReconAI:{shareLetter:text=>shared=text}}, alert(){},
 fetch(){network++;throw Error('Unexpected network request');},
 document:{getElementById:id=>elements.get(id),createElement:element}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('app/src/main/assets/free-workflow.js','utf8'),context);
(async()=>{
 await assert.rejects(context.window.phoneReconLookup({}), /disabled/);
 elements.get('phOwner').value = '<Owner & Test>';
 elements.get('phProp').value = '123 Test St, NJ';
 context.window.phoneReconSearch();
 const links=elements.get('phoneReconCandidates').children.filter(x=>x.href);
 assert.equal(links.length,2);
 assert.equal(new URL(links[0].href).searchParams.get('q'),'<Owner & Test> 123 Test St, NJ phone contact');
 assert.match(elements.get('phoneReconResult').textContent,/no number has been verified/);
 elements.get('cmLetter').value='My reviewed letter';
 context.window.cmShareFreeLetter(); assert.equal(shared,'My reviewed letter');
 context.window.cmEnhanceLetter(); assert.equal(network,0);
 const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
 assert.ok(!html.includes('https://deal-recon-phone-recon.dealrecon.workers.dev'));
 assert.ok(!html.includes('src="campaign-review-v3.js"'));
 const java=fs.readFileSync('app/src/main/java/com/kenleposa/dealrecon/MainActivity.java','utf8');
 for(const signature of ['public void ask(String prompt) {','public void analyzeDeedImage(String base64Image, String prompt) {']) {
   assert.match(java.slice(java.indexOf(signature),java.indexOf(signature)+260),/if \(freeEdition\).*return;/s);
 }
 console.log('Free workflow: zero provider requests, encoded research links, letter export and native AI gates passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
