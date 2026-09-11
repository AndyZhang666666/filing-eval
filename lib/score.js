// 打分逻辑从 run-eval.mjs 里抽出来，单独成模块。
//
// 为什么必须抽出来：一旦打分逻辑只存在于「跑评测」这个脚本里，
// 每次改判据都得重新调一遍模型 —— 既费钱，又让「改判据」和「重新采样」这两件事
// 混在一起。分开之后，results/*.json 里的模型输出是不可变的原始数据，
// 判据可以反复重算，两者各自演进。这一条在一个评测项目里是基本纪律。
//
// 另一个教训直接体现在下面的 isErrorItem 定义里：
// 初始版本用 tags.some(t => t.startsWith("error:")) 判断错误样本，
// 但金标里干净样本同时打着 "faithful" 和 "error:none" 两个标签 ——
// "error:none" 也是以 "error:" 开头的字符串。
// 于是 4 条干净样本被当成错误样本算进了检出率，而它们的期望本来就是"不该报错"，
// 必然通过。检出率因此虚高到 100%。
// 这个 bug 不报错、不崩溃，只是安静地把一个指标变成假数字 —— 最危险的一类。
export function isErrorItem(tags = []) {
  return tags.some((t) => t.startsWith("error:") && t !== "error:none");
}

export function isFaithfulItem(tags = []) {
  return tags.includes("faithful");
}

// 遗漏类错误（error:omission*）的"检出"就是覆盖率，不是断言分类。
// 这类样本必须用 max_coverage 判定，不能用 cont/unsup —— 摘要只是少说了话，没说错话。
export function isOmissionItem(tags = []) {
  return tags.some((t) => t === "error:omission" || t === "error:omission-material");
}

// 检查由 expect 驱动，不由 tag 驱动。
//
// 这是第二次踩同一类坑：一开始用 `if (isErrorItem(tags))` 决定"要不要查断言"，
// 结果 4 条边界样本（e02–e05）的 expect 写得清清楚楚，却因为 tag 不是 error: 开头
// 而一项检查都没执行 —— 整条静默通过。空测试检测器（checks === 0）把它们抓了出来。
// 教训：tag 是给人和统计看的分类，不该决定测试跑不跑；写了期望就要被检查。
export function scoreRun({ items, rubricVersion, model, promptVersion }) {
  const rows = [];
  for (const item of items) {
    const { tags = [], expect, judge } = item;
    const errItem = isErrorItem(tags);
    const omission = isOmissionItem(tags);
    const disputed = item.disputed === true;

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
    let checks = 0; // 数一下这条实际执行了几项检查。0 项 = 这条测试是空的，必须报出来。
    let falsePositive = false;

    // 「写错」下限。expect.unsupported === "high" 是早期写法，等价于"至少 3 条"。
    const expC = expect.min_contradicted ?? expect.contradicted;
    if (typeof expC === "number" && expC > 0) {
      checks++;
      const ok = c >= expC;
      hit = hit && ok;
      det.push(`写错 期望≥${expC} 实际${c}${ok ? " ✓" : " ✗"}`);
    }
    const expURaw = expect.min_unsupported ?? expect.unsupported;
    const expU = expURaw === "high" ? 3 : typeof expURaw === "number" ? expURaw : null;
    if (expU != null && expU > 0) {
      checks++;
      const ok = u >= expU;
      hit = hit && ok;
      det.push(`无据 期望≥${expU} 实际${u}${ok ? " ✓" : " ✗"}`);
    }

    // 「期望 0 条写错、0 条无据」= 干净样本判定。
    // 由期望驱动，不依赖 faithful 标签 —— 这样只写 expect 的边界样本也会被真正检查。
    // 遗漏类样本除外：它只是少说了话，本来就不该有断言被判错。
    if (!omission && expC === 0 && expURaw === 0) {
      checks++;
      const ok = c === 0 && u === 0;
      hit = hit && ok;
      falsePositive = !ok;
      det.push(`干净样本 期望 0/0 实际 ${c}/${u}${ok ? " ✓" : " ✗ 误报"}`);
    }

    // 覆盖率下限只对非错误样本判 —— 错误样本上覆盖率必然低，判它没意义。
    if (expect.min_coverage != null && !errItem) {
      checks++;
      const ok = (judge.coverage_rate ?? 0) >= expect.min_coverage - 0.01;
      hit = hit && ok;
      det.push(`覆盖 期望≥${expect.min_coverage} 实际${judge.coverage_rate}${ok ? " ✓" : " ✗"}`);
    }
    // 覆盖率上限：遗漏类错误的检出方式。裁判必须把覆盖率压得够低，才算"发现了遗漏"。
    if (expect.max_coverage != null) {
      checks++;
      const ok = (judge.coverage_rate ?? 1) <= expect.max_coverage + 0.01;
      hit = hit && ok;
      det.push(`覆盖 期望≤${expect.max_coverage} 实际${judge.coverage_rate}${ok ? " ✓" : " ✗ 未发现遗漏"}`);
    }

    // 一项检查都没执行 → 这条是空测试。标 hit=false 并明确写出原因，
    // 而不是让它静默通过 —— h06 第一版就是这样白测了一轮。
    if (checks === 0) {
      hit = false;
      det.push("⚠ 没有任何检查项被执行：标注方式与样本类型不匹配");
    }

    rows.push({
      id: item.id,
      category: tags.filter((t) => !t.startsWith("faithful")).join("/"),
      hit,
      falsePositive,
      disputed,
      checks,
      detail: det.join(" | ") + (disputed ? "  [争议样本，不计入检出率]" : ""),
    });
  }

  const graded = rows.filter((r) => r.category !== "run_failed");
  const byId = new Map(items.map((i) => [i.id, i]));
  // 争议样本从检出率分母里剔除，但仍出现在逐条列表里 —— 剔除是为了数字诚实，列出来是为了不藏。
  const errorRows = graded.filter((r) => isErrorItem(byId.get(r.id)?.tags) && !r.disputed);
  const disputedRows = graded.filter((r) => r.disputed);
  const faithfulRows = graded.filter((r) => isFaithfulItem(byId.get(r.id)?.tags));
  const fpRows = faithfulRows.filter((r) => r.falsePositive);
  const coverageRows = items.filter(
    (o) => o.judge.status === "ok" && o.expect?.min_coverage != null && !isErrorItem(o.tags)
  );
  const emptyRows = graded.filter((r) => r.checks === 0);
  const rate = (arr) => (arr.length ? Math.round((arr.filter((r) => r.hit).length / arr.length) * 1000) / 1000 : null);

  return {
    rows,
    summary: {
      rubric_version: rubricVersion,
      model,
      prompt_version: promptVersion || "default",
      items: items.length,
      run_failed: rows.filter((r) => r.category === "run_failed").length,
      empty_tests: emptyRows.map((r) => r.id),

      detection_rate: rate(errorRows),
      detection: `${errorRows.filter((r) => r.hit).length}/${errorRows.length}`,
      missed_ids: errorRows.filter((r) => !r.hit).map((r) => r.id),
      disputed_ids: disputedRows.map((r) => r.id),

      false_positive_rate: faithfulRows.length ? Math.round((fpRows.length / faithfulRows.length) * 1000) / 1000 : null,
      false_positive: `${fpRows.length}/${faithfulRows.length}`,
      false_positive_ids: fpRows.map((r) => r.id),

      coverage_pass: `${coverageRows.filter((r) => (r.judge.coverage_rate ?? 0) >= (r.expect.min_coverage ?? 0) - 0.01).length}/${coverageRows.length}`,
      coverage_failed_ids: coverageRows
        .filter((r) => (r.judge.coverage_rate ?? 0) < (r.expect.min_coverage ?? 0) - 0.01)
        .map((r) => r.id),

      unsupported_items_coverage: items
        .filter((o) => o.tags.includes("error:unsupported") && o.judge.status === "ok")
        .map((o) => ({ id: o.id, coverage: o.judge.coverage_rate, fabricated: o.judge.counts.unsupported })),

      overall_hit_rate: rate(graded),
    },
  };
}
