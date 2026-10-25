import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  locateQuote,
  reviewKey,
  decodeReviews,
  exportReviews,
} from "../demo/review-core.js";
const dataset = JSON.parse(
  fs.readFileSync(new URL("../demo/data.json", import.meta.url)),
);
test("UTF-16原文位置保留emoji前缀和空白；不做语义改写", () => {
  const s = "🙂 公司\n拟出资 1.2 亿元。";
  const loc = locateQuote(s, "公司拟出资1.2亿元");
  assert.equal(s.slice(loc.start, loc.end), "公司\n拟出资 1.2 亿元");
  assert.equal(loc.method, "忽略空白");
  assert.equal(locateQuote(s, "公司已出资12亿元"), null);
  assert.equal(locateQuote(s, "  "), null);
  assert.equal(locateQuote(s, "1.2").method, "逐字");
});
const r = {
  sampleId: "f05",
  kind: "claim",
  index: 0,
  decision: "agree",
  note: "",
  at: "2026-10-25T00:00:00Z",
};
test("旧断言复核迁移与新覆盖复核分开", () => {
  const old = {
    sampleId: "f05",
    claimIndex: 0,
    decision: "agree",
    note: "",
    at: r.at,
  };
  assert.equal(
    decodeReviews(JSON.stringify({ "f05:0": old }), dataset)["f05:0"].kind,
    "claim",
  );
  const f = { ...r, kind: "fact" };
  const key = reviewKey(f.sampleId, f.kind, f.index);
  assert.equal(
    decodeReviews(JSON.stringify({ [key]: f }), dataset)[key].kind,
    "fact",
  );
});
test("错误键、越界目标、无依据争议、非法日期拒绝恢复", () => {
  for (const [key, value] of [
    ["wrong", r],
    ["f05:0", { ...r, index: -1 }],
    ["f05:0", { ...r, at: "x" }],
    ["f05:0", { ...r, decision: "needs-review" }],
    ["f05:0", { ...r, note: "x".repeat(2001) }],
  ])
    assert.throws(() =>
      decodeReviews(JSON.stringify({ [key]: value }), dataset),
    );
  for (const v of ["[]", "null", "{"])
    assert.throws(() => decodeReviews(v, dataset));
});
test("导出绑定源文/摘要/原断言，未保存草稿不充作审核", () => {
  const before = JSON.stringify(dataset);
  const report = exportReviews(dataset, { "f05:0": r }, { "f05:1": {} });
  assert.equal(
    report.reviews[0].sourceText,
    dataset.samples.find((s) => s.id === "f05").source,
  );
  assert.equal(
    report.reviews[0].originalRecord,
    dataset.samples.find((s) => s.id === "f05").judge.claims[0],
  );
  assert.equal(report.unsavedDraftCount, 1);
  assert.equal(report.reviews.length, 1);
  assert.equal(JSON.stringify(dataset), before);
});
test("28例所有断言与事实目标均可隔离导出，原始版本不变", () => {
  const saved = {};
  let n = 0;
  for (const s of dataset.samples)
    for (const kind of ["claim", "fact"])
      for (
        let i = 0;
        i < (kind === "claim" ? s.judge.claims : s.judge.key_facts)?.length;
        i++
      ) {
        const row = { ...r, sampleId: s.id, kind, index: i };
        saved[reviewKey(s.id, kind, i)] = row;
        n++;
      }
  const decoded = decodeReviews(JSON.stringify(saved), dataset);
  assert.equal(Object.keys(decoded).length, n);
  assert.equal(exportReviews(dataset, decoded).reviews.length, n);
  assert.ok(n > 50);
});
