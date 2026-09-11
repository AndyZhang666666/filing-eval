// 稳定性：同一条输入连跑 N 次，看裁判的判定会不会自己变。
//
// 这个项目的稳定性比剧本评测更要紧：主观打分 4 变 3 是"口味"，
// 但事实核验里 contradicted 变 supported 是"这次没抓到"。
// 所以这里不看分数方差，看标签翻转 —— 同一条断言在 N 次运行中有没有被判成不同的类。
//
// 断言对齐的难点：模型每次拆断言的粒度不同，没法逐条对齐。
// 所以对齐的是"结论"层：每次运行的 (写错数, 无据数) 对，以及幻觉率。
// 这个粒度足够回答"这个裁判能不能拿去做回归测试"。
import "./_env.mjs";
import fs from "node:fs";
import { GOLDEN } from "../data/golden/set.js";
import { judgeSummary, DEFAULT_JUDGE_MODEL, CURRENT_PROMPT } from "../lib/judge.js";

const model = process.argv[2] || DEFAULT_JUDGE_MODEL;
const runs = Number(process.argv[3] || 3);
// 挑得有代表性：2 条干净、4 条不同类型的写错、2 条编造、1 条遗漏、1 条注入。
const ids = (process.argv[4] || "f01,f04,f05,f07,f08,f09,f10,f12,f14,e04").split(",");
const items = GOLDEN.filter((g) => ids.includes(g.id));

console.log(`稳定性 | ${model} | prompt ${CURRENT_PROMPT} | ${items.length} 条 × ${runs} 次`);

const jobs = [];
for (const g of items) for (let k = 0; k < runs; k++) jobs.push({ g, k });
const results = new Map(items.map((g) => [g.id, []]));

let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const { g, k } = jobs[cursor++];
    const r = await judgeSummary({ source: g.source, summary: g.summary, model }).catch((e) => ({ status: "error", reason: String(e.message || e) }));
    results.get(g.id)[k] = r;
    const s = r.status === "ok" ? `c=${r.counts.contradicted} u=${r.counts.unsupported} h=${r.hallucination_rate} cov=${r.coverage_rate}` : r.status;
    console.log(`${g.id} #${k + 1}  ${s}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

const std = (a) => {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
};

const rows = [];
for (const g of items) {
  const rs = results.get(g.id).filter((r) => r?.status === "ok");
  if (rs.length < 2) {
    rows.push({ id: g.id, ok_runs: rs.length, note: "有效运行不足 2 次" });
    continue;
  }
  const cs = rs.map((r) => r.counts.contradicted);
  const us = rs.map((r) => r.counts.unsupported);
  const hs = rs.map((r) => r.hallucination_rate ?? 0);
  const covs = rs.map((r) => r.coverage_rate ?? 0);
  // "结论翻转"：任一次运行的 (是否有写错, 是否有无据) 二元结论与其他次不同。
  const verdicts = rs.map((r) => `${r.counts.contradicted > 0 ? "C" : "-"}${r.counts.unsupported > 0 ? "U" : "-"}`);
  const flipped = new Set(verdicts).size > 1;
  rows.push({
    id: g.id,
    tags: g.tags,
    ok_runs: rs.length,
    contradicted: cs,
    unsupported: us,
    verdicts,
    verdict_flipped: flipped,
    hallucination_std: Math.round(std(hs) * 1000) / 1000,
    coverage_std: Math.round(std(covs) * 1000) / 1000,
    latency_ms: rs.map((r) => r.latency_ms),
  });
}

const graded = rows.filter((r) => r.verdicts);
const summary = {
  model,
  prompt_version: CURRENT_PROMPT,
  items: items.length,
  runs,
  avg_hallucination_std: Math.round((graded.reduce((a, r) => a + r.hallucination_std, 0) / graded.length) * 1000) / 1000,
  avg_coverage_std: Math.round((graded.reduce((a, r) => a + r.coverage_std, 0) / graded.length) * 1000) / 1000,
  // 最重要的一个数：有多少条的"有错/没错"结论在 N 次里翻了。翻了就不能拿来做回归测试。
  items_with_verdict_flip: graded.filter((r) => r.verdict_flipped).length,
  flipped_ids: graded.filter((r) => r.verdict_flipped).map((r) => r.id),
  // 断言计数完全一致的条目：这是更严的口径。
  fully_stable_items: graded.filter((r) => new Set(r.contradicted).size === 1 && new Set(r.unsupported).size === 1).length,
  avg_latency_ms: Math.round(graded.flatMap((r) => r.latency_ms).reduce((a, b) => a + b, 0) / graded.flatMap((r) => r.latency_ms).length),
};

console.log("\n" + JSON.stringify(summary, null, 2));
for (const r of graded) {
  console.log(`${r.id}  结论 ${r.verdicts.join(" ")}${r.verdict_flipped ? "  ← 翻转" : ""}  写错 ${r.contradicted.join("/")}  无据 ${r.unsupported.join("/")}  幻觉率σ ${r.hallucination_std}`);
}

fs.mkdirSync("results", { recursive: true });
fs.writeFileSync("results/stability.json", JSON.stringify({ summary, rows }, null, 2));
console.log("saved results/stability.json");
