// 跑金标集：调模型 → 逐条判定 → 落盘。
// 指标先合成一个总分：检出 + 误报 + 覆盖，三项全过才算这条通过。
import "./_env.mjs";
import fs from "node:fs";
import { GOLDEN } from "../data/golden/set.js";
import { judgeSummary, DEFAULT_JUDGE_MODEL } from "../lib/judge.js";
import { RUBRIC_VERSION } from "../lib/rubric.js";

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

const rows = [];
for (const item of out) {
  const { tags = [], expect, judge } = item;
  const errItem = tags.some((t) => t.startsWith("error:"));
  const faithful = tags.includes("faithful");

  if (expect?.rejected) {
    rows.push({ id: item.id, kind: "rejected", hit: judge.status === "rejected", detail: judge.reason ?? judge.status });
    continue;
  }
  if (judge.status !== "ok") {
    rows.push({ id: item.id, kind: "run_failed", hit: false, detail: `${judge.status}${judge.reason ? "：" + judge.reason : ""}` });
    continue;
  }

  const c = judge.counts.contradicted;
  const u = judge.counts.unsupported;
  const det = [];
  let hit = true;

  if (errItem) {
    const expC = expect.min_contradicted ?? expect.contradicted;
    if (typeof expC === "number" && expC > 0) {
      const ok = c >= expC;
      hit = hit && ok;
      det.push(`写错 期望≥${expC} 实际${c}${ok ? " ✓" : " ✗"}`);
    }
    const expU = expect.min_unsupported ?? expect.unsupported;
    if (typeof expU === "number" && expU > 0) {
      const ok = u >= expU;
      hit = hit && ok;
      det.push(`无据 期望≥${expU} 实际${u}${ok ? " ✓" : " ✗"}`);
    }
  }
  if (faithful) {
    const ok = c === 0 && u === 0;
    hit = hit && ok;
    det.push(`干净样本 期望 0/0 实际 ${c}/${u}${ok ? " ✓" : " ✗ 误报"}`);
  }
  if (expect.min_coverage != null) {
    const ok = (judge.coverage_rate ?? 0) >= expect.min_coverage - 0.01;
    hit = hit && ok;
    det.push(`覆盖 期望≥${expect.min_coverage} 实际${judge.coverage_rate}${ok ? " ✓" : " ✗"}`);
  }
  if (expect.max_coverage != null) {
    const ok = (judge.coverage_rate ?? 1) <= expect.max_coverage + 0.01;
    hit = hit && ok;
    det.push(`覆盖 期望≤${expect.max_coverage} 实际${judge.coverage_rate}${ok ? " ✓" : " ✗"}`);
  }
  rows.push({ id: item.id, kind: tags.join("/"), hit, detail: det.join(" | ") });
}

const byId = new Map(out.map((i) => [i.id, i]));
const graded = rows.filter((r) => r.kind !== "run_failed" && r.kind !== "rejected");
const errRows = graded.filter((r) => (byId.get(r.id)?.tags ?? []).some((t) => t.startsWith("error:")));
const faithfulRows = graded.filter((r) => (byId.get(r.id)?.tags ?? []).includes("faithful"));
const rate = (arr) => (arr.length ? Math.round((arr.filter((r) => r.hit).length / arr.length) * 1000) / 1000 : null);

const summary = {
  rubric_version: RUBRIC_VERSION,
  model,
  prompt_version: promptVersion || "default",
  items: out.length,
  run_failed: rows.filter((r) => r.kind === "run_failed").length,
  detection_rate: rate(errRows),
  detection: `${errRows.filter((r) => r.hit).length}/${errRows.length}`,
  false_positive_rate: faithfulRows.length ? Math.round((faithfulRows.filter((r) => !r.hit).length / faithfulRows.length) * 1000) / 1000 : null,
  false_positive: `${faithfulRows.filter((r) => !r.hit).length}/${faithfulRows.length}`,
  overall_hit_rate: rate(graded),
};

console.log("\n逐条判定：");
for (const r of rows) console.log(`${r.hit ? "✓" : "✗"} ${r.id.padEnd(4)} [${r.kind}] ${r.detail}`);
console.log("\n" + JSON.stringify(summary, null, 2));

fs.mkdirSync("results", { recursive: true });
const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "");
const tag = promptVersion ? `-p${promptVersion}` : "";
const payload = { summary, rows, items: out };
const file = `results/eval-${model.replace(/[^a-z0-9.-]/gi, "_")}${tag}-${ts}.json`;
fs.writeFileSync(file, JSON.stringify(payload, null, 2));
fs.writeFileSync("results/latest.json", JSON.stringify(payload, null, 2));
console.log(`saved ${file}`);
