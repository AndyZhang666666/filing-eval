// 跑金标集。指标定义在 lib/score.js，这里只负责调用模型 + 落盘。
import "./_env.mjs";
import fs from "node:fs";
import { GOLDEN } from "../data/golden/set.js";
import { judgeSummary, DEFAULT_JUDGE_MODEL } from "../lib/judge.js";
import { RUBRIC_VERSION } from "../lib/rubric.js";
import { scoreRun } from "../lib/score.js";

const model = process.argv[2] || DEFAULT_JUDGE_MODEL;
const filter = process.argv[3] || "";
const promptVersion = process.argv[4] || undefined;
const items = filter ? GOLDEN.filter((g) => g.id.startsWith(filter)) : GOLDEN;

console.log(`rubric ${RUBRIC_VERSION} | judge ${model} | prompt ${promptVersion || "默认"} | ${items.length} 条`);

const out = [];
let cursor = 0;
async function worker() {
  while (cursor < items.length) {
    const g = items[cursor++];
    const t0 = Date.now();
    let r;
    try {
      r = await judgeSummary({ source: g.source, summary: g.summary, model, promptVersion });
    } catch (e) {
      r = { status: "error", reason: String(e.message || e) };
    }
    out.push({ id: g.id, tags: g.tags, note: g.note ?? null, expect: g.expect, judge: r });
    const s =
      r.status === "ok"
        ? `写错=${r.counts.contradicted} 无据=${r.counts.unsupported} 有据=${r.counts.supported} 幻觉率=${r.hallucination_rate} 覆盖=${r.coverage_rate}`
        : `${r.status}${r.reason ? "：" + r.reason : ""}`;
    console.log(`${g.id.padEnd(4)} ${String(Date.now() - t0).padStart(6)}ms  ${s}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
out.sort((a, b) => a.id.localeCompare(b.id));

const { rows, summary } = scoreRun({ items: out, rubricVersion: RUBRIC_VERSION, model, promptVersion });

console.log("\n逐条判定：");
for (const r of rows) console.log(`${r.hit ? "✓" : "✗"} ${r.id.padEnd(4)} [${r.category}] ${r.detail}`);
console.log("\n" + JSON.stringify(summary, null, 2));

fs.mkdirSync("results", { recursive: true });
const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "");
const tag = promptVersion ? `-p${promptVersion}` : "";
const payload = { summary, rows, items: out };
const file = `results/eval-${model.replace(/[^a-z0-9.-]/gi, "_")}${tag}-${ts}.json`;
fs.writeFileSync(file, JSON.stringify(payload, null, 2));
fs.writeFileSync("results/latest.json", JSON.stringify(payload, null, 2));
console.log(`saved ${file}`);
