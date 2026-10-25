/* Pure replay helpers. No model calls and no mutable historical labels. */
export const decisions = ["agree", "disagree", "needs-review"];
export function locateQuote(source, quote) {
  if (typeof quote !== "string" || !quote.trim()) return null;
  let start = source.indexOf(quote);
  if (start >= 0) return { start, end: start + quote.length, method: "逐字" };
  const chars = [],
    positions = [];
  for (let i = 0; i < source.length; i++) {
    if (!/\s/u.test(source[i])) {
      chars.push(source[i]);
      positions.push(i);
    }
  }
  const compact = quote.replace(/\s/gu, "");
  if (!compact) return null;
  start = chars.join("").indexOf(compact);
  return start < 0
    ? null
    : {
        start: positions[start],
        end: positions[start + compact.length - 1] + 1,
        method: "忽略空白",
      };
}
export function reviewKey(sampleId, kind, index) {
  return kind === "claim"
    ? `${sampleId}:${index}`
    : `${sampleId}:fact:${index}`;
}
export function targetRecord(dataset, sampleId, kind, index) {
  if (
    !["claim", "fact"].includes(kind) ||
    !Number.isInteger(index) ||
    index < 0
  )
    return null;
  const sample = dataset.samples.find((s) => s.id === sampleId);
  if (!sample) return null;
  const original = (
    kind === "claim" ? sample.judge.claims : sample.judge.key_facts
  )?.[index];
  return original ? { sample, original } : null;
}
export function decodeReviews(raw, dataset) {
  if (!raw) return {};
  if (raw.length > 2000000) throw Error("复核记录过大");
  const data = JSON.parse(raw);
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.keys(data).length > 1000
  )
    throw Error("复核格式错误");
  const next = {};
  for (const [key, r] of Object.entries(data)) {
    const kind = r?.kind ?? "claim",
      index = r?.index ?? r?.claimIndex;
    if (
      !r ||
      !targetRecord(dataset, r.sampleId, kind, index) ||
      key !== reviewKey(r.sampleId, kind, index) ||
      !decisions.includes(r.decision) ||
      typeof r.note !== "string" ||
      r.note.length > 2000 ||
      (r.decision !== "agree" && !r.note.trim()) ||
      typeof r.at !== "string" ||
      !Number.isFinite(Date.parse(r.at))
    )
      throw Error("复核字段错误");
    next[key] = {
      sampleId: r.sampleId,
      kind,
      index,
      decision: r.decision,
      note: r.note,
      at: r.at,
    };
  }
  return next;
}
export function exportReviews(dataset, reviews, drafts = {}) {
  const entries = Object.values(reviews).map((r) => {
    const target = targetRecord(dataset, r.sampleId, r.kind, r.index);
    if (!target) throw Error("复核目标不存在");
    return {
      ...r,
      sourceText: target.sample.source,
      summary: target.sample.summary,
      originalRecord: target.original,
      disputed: target.sample.disputed,
      tier: target.sample.tier,
    };
  });
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    datasetVersion: dataset.version,
    provenance: dataset.provenance,
    notice:
      "本地访客复核；不是独立人工金标、不是新的模型成绩，不构成发布许可。",
    reviews: entries,
    unsavedDraftCount: Object.keys(drafts).length,
    limits: [
      "历史断言与覆盖判断未经此次模型重跑",
      "引用能定位不等于推理成立",
      "未保存草稿不计入已复核，刷新会丢失",
      "只核对给定模拟原文，不核实外部世界真实性",
    ],
  };
}
