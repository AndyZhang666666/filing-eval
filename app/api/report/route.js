import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { GOLDEN, GOLDEN_STATS } from "@/data/golden/set";
import { HARD_STATS } from "@/data/golden/hard";

export const runtime = "nodejs";

function readJson(file) {
  const p = path.join(process.cwd(), "results", file);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// 把校验脚本的输出拼成一页报告。缺哪个就返回 null，页面显示「还没跑」。
export async function GET() {
  const evalRun = readJson("latest.json");
  const hardRun = readJson("latest-hard.json");
  const stability = readJson("stability.json");
  const adversarial = readJson("adversarial.json");
  const agreement = readJson("agreement.json");
  const pending = readJson("pending-labels.json");

  // 还没人工复核的标注：金标集里每一条的 expect 都是模型起草的。
  // 把这件事显式暴露在页面上，而不是藏在 README 里 ——
  // 一个没经人工确认的测试集，得出的数字再漂亮也没有意义。
  const pendingLabels =
    pending?.items ||
    GOLDEN.filter((g) => !g.reviewed).map((g) => ({
      id: g.id,
      kind: g.tags.join(", "),
      expect: JSON.stringify(g.expect),
      note: g.note || "",
    }));

  const slim = (run) =>
    run
      ? {
          summary: run.summary,
          rows: run.rows,
          items: (run.items || []).map((i) => ({
            id: i.id,
            tags: i.tags,
            note: i.note,
            expect: i.expect,
            disputed: i.disputed === true,
            status: i.judge?.status,
            counts: i.judge?.counts,
            hallucination_rate: i.judge?.hallucination_rate,
            coverage_rate: i.judge?.coverage_rate,
            verdict: i.judge?.one_line_verdict,
          })),
        }
      : null;

  return NextResponse.json({
    golden_total: GOLDEN_STATS.total,
    golden_normal: GOLDEN_STATS.faithful,
    golden_edge: GOLDEN_STATS.edge,
    golden_hard: HARD_STATS.total,
    reviewed: GOLDEN.filter((g) => g.reviewed).length,
    // 主集 = 回归基线。困难集单独一块，不能混进平均 —— 它测的是上限，不是质量。
    eval_summary: evalRun?.summary || null,
    eval_rows: evalRun?.rows || null,
    eval_items: slim(evalRun)?.items || [],
    hard_summary: hardRun?.summary || null,
    hard_rows: hardRun?.rows || null,
    hard_items: slim(hardRun)?.items || [],
    stability: stability || null,
    adversarial: adversarial || null,
    agreement: agreement || null,
    pending_labels: pendingLabels,
  });
}
