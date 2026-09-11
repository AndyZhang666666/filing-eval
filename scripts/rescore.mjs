// 用当前判据重算 results/*.json 里的历史结果，不重新调用模型。
//
// 这是把打分逻辑抽到 lib/score.js 之后立刻能做的事，也是抽出来的全部理由：
// 判据改了，历史数据不用重跑就能重新解读。
// 代价是：重算出来的数字必须标明是哪一版判据算的，否则不同判据的数字混在一张表里，
// 就会得出"模型变好了"的错误结论 —— 其实只是及格线动了。
//
// 用法：
//   node scripts/rescore.mjs                  # 重算全部历史结果
//   node scripts/rescore.mjs <文件名>          # 只重算某一个
import "./_env.mjs";
import fs from "node:fs";
import path from "node:path";
import { scoreRun } from "../lib/score.js";

const dir = "results";
const only = process.argv[2];
const files = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith("eval-") && f.endsWith(".json"))
  .filter((f) => (only ? f.includes(only) : true))
  .sort();

if (!files.length) {
  console.log("results/ 下没有找到 eval-*.json");
  process.exit(0);
}

const table = [];
for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (!raw.items?.length) continue;
  const { summary, rows } = scoreRun({
    items: raw.items,
    rubricVersion: raw.summary?.rubric_version,
    model: raw.summary?.model,
    promptVersion: raw.summary?.prompt_version,
  });
  table.push({ file: f, ...summary });
  // summary 和 rows 一起重写。只重写 summary 会让逐条明细和总数对不上 —— 已经踩过一次。
  raw.summary = summary;
  raw.rows = rows;
  raw.rescored_at = new Date().toISOString();
  fs.writeFileSync(path.join(dir, f), JSON.stringify(raw, null, 2));
}

// 同模型不同 prompt 版本横向比 —— 这才是这张表存在的意义。
console.log("文件".padEnd(52), "prompt".padEnd(8), "检出率".padEnd(12), "误报率".padEnd(10), "覆盖率");
for (const t of table) {
  const dr = t.detection_rate == null ? "—" : `${(t.detection_rate * 100).toFixed(0)}% (${t.detection})`;
  const fp = t.false_positive_rate == null ? "—" : `${(t.false_positive_rate * 100).toFixed(0)}% (${t.false_positive})`;
  console.log(
    t.file.padEnd(52),
    String(t.prompt_version).padEnd(8),
    dr.padEnd(12),
    fp.padEnd(10),
    t.coverage_pass
  );
}

// latest.json 指向主集最新一次；hard 集另存 latest-hard.json。
// 两者不能混：页面的头条数字必须是回归基线（主集），困难集是"探上限"的补充说明。
const isHard = (t) => {
  const src = JSON.parse(fs.readFileSync(path.join(dir, t.file), "utf8"));
  return src.items?.every((i) => i.id.startsWith("h"));
};
const mainLatest = [...table].reverse().find((t) => !isHard(t));
const hardLatest = [...table].reverse().find((t) => isHard(t));
if (mainLatest) {
  fs.copyFileSync(path.join(dir, mainLatest.file), path.join(dir, "latest.json"));
  console.log(`\nlatest.json      ← ${mainLatest.file}`);
}
if (hardLatest) {
  fs.copyFileSync(path.join(dir, hardLatest.file), path.join(dir, "latest-hard.json"));
  console.log(`latest-hard.json ← ${hardLatest.file}`);
}
