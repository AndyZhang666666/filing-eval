// 打分逻辑从 run-eval.mjs 里抽出来，单独成模块 —— 行为一字未改，只是搬了个家。
//
// 为什么必须抽出来：一旦打分逻辑只存在于「跑评测」这个脚本里，
// 每次改判据都得重新调一遍模型 —— 既费钱，又让「改判据」和「重新采样」这两件事
// 混在一起。分开之后，results/*.json 里的模型输出是不可变的原始数据，
// 判据可以反复重算，两者各自演进。这一条在一个评测项目里是基本纪律。
export function isErrorItem(tags = []) {
  return tags.some((t) => t.startsWith("error:"));
}

export function isFaithfulItem(tags = []) {
  return tags.includes("faithful");
}

export function scoreRun({ items, rubricVersion, model, promptVersion }) {
  const rows = [];
  for (const item of items) {
    const { tags = [], expect, judge } = item;
    const errItem = isErrorItem(tags);
    const faithful = isFaithfulItem(tags);

    if (expect?.rejected) {
      rows.push({ id: item.id, category: "rejected", hit: judge.status === "rejected", detail: judge.reason ?? judge.status });
      continue;
    }
    if (judge.status !== "ok") {
      rows.push({ id: item.id, category: "run_failed", hit: false, detail: `${judge.status}${judge.reason ? "：" + judge.reason : ""}` });
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

    rows.push({ id: item.id, category: tags.join("/"), hit, detail: det.join(" | ") });
  }

  const graded = rows.filter((r) => r.category !== "run_failed" && r.category !== "rejected");
  const byId = new Map(items.map((i) => [i.id, i]));
  const errorRows = graded.filter((r) => isErrorItem(byId.get(r.id)?.tags));
  const faithfulRows = graded.filter((r) => isFaithfulItem(byId.get(r.id)?.tags));
  const rate = (arr) => (arr.length ? Math.round((arr.filter((r) => r.hit).length / arr.length) * 1000) / 1000 : null);

  return {
    rows,
    summary: {
      rubric_version: rubricVersion,
      model,
      prompt_version: promptVersion || "default",
      items: items.length,
      run_failed: rows.filter((r) => r.category === "run_failed").length,
      detection_rate: rate(errorRows),
      detection: `${errorRows.filter((r) => r.hit).length}/${errorRows.length}`,
      false_positive_rate: faithfulRows.length ? Math.round((faithfulRows.filter((r) => !r.hit).length / faithfulRows.length) * 1000) / 1000 : null,
      false_positive: `${faithfulRows.filter((r) => !r.hit).length}/${faithfulRows.length}`,
      overall_hit_rate: rate(graded),
    },
  };
}
