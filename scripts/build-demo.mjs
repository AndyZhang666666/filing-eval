import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GOLDEN } from '../data/golden/set.js';
import { HARD } from '../data/golden/hard.js';

const read = p => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const main = read('results/latest.json'), hard = read('results/latest-hard.json');
const runs = [...main.items, ...hard.items];
const corpus = [...GOLDEN, ...HARD];
const samples = runs.map(run => {
  const source = corpus.find(v => v.id === run.id);
  assert(source, `No source for ${run.id}`);
  return { id: run.id, tier: run.id.startsWith('h') ? 'hard' : 'main', source: source.source, summary: source.summary,
    note: source.note || '', tags: source.tags, expect: source.expect, reviewed: source.reviewed === true,
    disputed: run.disputed === true, judge: run.judge };
});
assert.equal(new Set(samples.map(s => s.id)).size, samples.length);
assert.equal(samples.length, 28);
const payload = { version: crypto.createHash('sha256').update(JSON.stringify(samples)).digest('hex').slice(0, 12),
  provenance: { source: 'data/golden/set.js + hard.js', results: ['results/latest.json', 'results/latest-hard.json'],
    mode: 'historical-replay', prompt: main.summary.prompt_version, model: main.summary.model,
    boundary: '模拟公司公告；历史输出；预期标签未完成独立人工复核；不调用模型。' },
  summaries: { main: main.summary, hard: hard.summary }, samples };
fs.writeFileSync(new URL('../demo/data.json', import.meta.url), JSON.stringify(payload, null, 2) + '\n');
fs.writeFileSync(new URL('../demo/.nojekyll', import.meta.url), '');
console.log(`Projected ${samples.length} historical cases; ${samples.filter(s => s.reviewed).length} independently marked reviewed in source. No model calls.`);
