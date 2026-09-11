// 跑金标集。指标定义在 lib/score.js，这里只负责调用模型 + 落盘。
//
// 为什么不合成一个总分 —— 这是这个项目最重要的一个产品判断：
// 查错类产品有两个方向相反的代价。漏掉一个「1.2 亿写成 12 亿」，产品存在的意义就没了；
// 误报一个干净摘要，审核员就开始不再信任它，工具三个月后被弃用。
// 把两者合成 F1 会得到一个"看起来不错"的分数，但完全看不出该往哪个方向调。
// 所以报三个数字：检出率 / 误报率 / 覆盖率。
import "./_env.mjs";
import fs from "node:fs";
import { GOLDEN } from "../data/golden/set.js";
import { HARD } from "../data/golden/hard.js";
import { judgeSummary, DEFAULT_JUDGE_MODEL } from "../lib/judge.js";
import { RUBRIC_VERSION } from "../lib/rubric.js";
import { scoreRun, isErrorItem } from "../lib/score.js";

const model = process.argv[2] || DEFAULT_JUDGE_MODEL;
const filter = process.argv[3] || "";
const promptVersion = process.argv[4] || undefined;

// tier=hard 只跑困难集，tier=all 跑主集+困难集，默认只跑主集。
// 分开是有意的：主集是"回归基线"，困难集是"探上限"，两者的数字不该混在一个平均值里。
const tier = (process.env.TIER || "main").toLowerCase();
const pool = tier === "hard" ? HARD : tier === "all" ? [...GOLDEN, ...HARD] : GOLDEN;
const items = filter ? pool.filter((g) => g.id.startsWith(filter)) : pool;

const errCount = items.filter((g) => isErrorItem(g.tags)).length;
console.log(`rubric ${RUBRIC_VERSION} | judge ${model} | prompt ${promptVersion || "默认"} | tier ${tier} | ${items.length} 条（其中错误样本 ${errCount} 条）`);

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
    out.push({ id: g.id, tags: g.tags, note: g.note ?? null, expect: g.expect, disputed: g.disputed === true, judge: r });
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
