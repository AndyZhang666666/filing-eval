import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const data=read('demo/data.json'), holdout=read('data/review-holdout.json');
let claims=0, located=0, missing=0;
for(const s of data.samples){
  assert.equal(typeof s.source,'string'); assert.equal(typeof s.summary,'string');
  assert.equal(s.judge.prompt_version||data.provenance.prompt,'v1.2');
  for(const c of s.judge.claims||[]){
    assert(['supported','contradicted','unsupported','not_checkable'].includes(c.label)); claims++;
    if(c.source_quote){ if(s.source.replace(/\s/g,'').includes(c.source_quote.replace(/\s/g,'')))located++;else missing++; }
  }
}
assert.equal(data.samples.length,28);
assert.equal(data.samples.find(s=>s.id==='h05').disputed,true);
assert(!holdout.items.some(s=>data.samples.some(v=>v.id===s.id)));
assert.equal(holdout.status,'candidate-unreviewed-unrun');
assert(!fs.readFileSync(new URL('../demo/app.js',import.meta.url),'utf8').includes('/api/'));
console.log(JSON.stringify({cases:data.samples.length,claims,locatedQuotes:located,unlocatedQuotes:missing,holdoutCandidates:holdout.items.length,modelCalls:0}));
console.log('Integrity checks passed. Quote matching is NOT semantic validation or human review.');
