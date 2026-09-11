"use client";

// 把摘要按断言切段上色：写错 / 无据 各自标出来，点一条能在原文里对到依据。
//
// 为什么这个组件是这个项目最该做的东西：
// 合规审核员看的不是"幻觉率 0.33"这种数字，而是"这几个字错了、错在哪"。
// 一个只输出分数的工具没人会用；把错误定位到具体的字，工具才进入工作流。
//
// 实现上没有用富文本/markdown 渲染，而是让裁判直接给出每条断言的文本片段，
// 用字符串匹配在摘要里定位再包一层 <mark>。理由：让模型输出带标记的 HTML 很容易被注入，
// 而且标记偶尔错位会让整段文本错乱。文本片段定位是最小权限的做法 ——
// 匹配不到就退化成"不标"，绝不破坏原文。
import { useState } from "react";

const LABEL_STYLE = {
  contradicted: { cls: "mark-bad", name: "写错" },
  unsupported: { cls: "mark-warn", name: "无据" },
};

function locate(summary, claimText) {
  if (!claimText) return null;
  const t = claimText.trim();
  // 先整体匹配；匹配不到就退到前 12 个字。模型经常在末尾多带标点或漏字。
  let idx = summary.indexOf(t);
  if (idx >= 0) return { start: idx, end: idx + t.length };
  const head = t.slice(0, 12);
  if (head.length >= 6) {
    idx = summary.indexOf(head);
    if (idx >= 0) return { start: idx, end: idx + head.length };
  }
  return null;
}

export default function ClaimHighlighter({ summary, claims, onPick }) {
  const [active, setActive] = useState(null);

  const marks = [];
  claims.forEach((c, i) => {
    const style = LABEL_STYLE[c.label];
    if (!style) return;
    const pos = locate(summary, c.text);
    if (pos) marks.push({ ...pos, i, claim: c, style });
    else marks.push({ unresolved: true, i, claim: c, style });
  });
  marks.sort((a, b) => (a.unresolved ? 1 : b.unresolved ? -1 : a.start - b.start));

  // 有重叠时保留先出现的，避免嵌套标记把文本切碎。
  const kept = [];
  let lastEnd = -1;
  for (const m of marks) {
    if (m.unresolved) { kept.push(m); continue; }
    if (m.start >= lastEnd) { kept.push(m); lastEnd = m.end; }
    else kept.push({ ...m, unresolved: true });
  }

  const segs = [];
  let cursor = 0;
  for (const m of kept) {
    if (m.unresolved) continue;
    if (m.start > cursor) segs.push({ text: summary.slice(cursor, m.start) });
    segs.push({ text: summary.slice(m.start, m.end), m });
    cursor = m.end;
  }
  if (cursor < summary.length) segs.push({ text: summary.slice(cursor) });

  const unresolved = kept.filter((m) => m.unresolved);

  return (
    <div className="hl-wrap">
      <div className="hl-body">
        {segs.map((s, i) =>
          s.m ? (
            <mark
              key={i}
              className={s.m.style.cls + (active === s.m.i ? " on" : "")}
              onClick={() => {
                setActive(active === s.m.i ? null : s.m.i);
                onPick?.(s.m.claim);
              }}
              title={s.m.style.name}
            >
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          )
        )}
      </div>

      <div className="hl-legend">
        <span><i className="sw mark-bad" /> 写错（与原文矛盾）</span>
        <span><i className="sw mark-warn" /> 无据（原文中不存在）</span>
        <span className="small">点标注看依据</span>
      </div>

      {unresolved.length > 0 && (
        <div className="small" style={{ marginTop: 8 }}>
          另有 {unresolved.length} 条断言未能在摘要中精确定位（已在下方列表列出）：
          {unresolved.map((m) => (
            <span key={m.i} className={"chip " + (m.style.cls === "mark-bad" ? "bad" : "warn")}>
              {m.style.name}·{m.claim.text.slice(0, 14)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClaimList({ claims, active }) {
  const bad = claims.filter((c) => c.label === "contradicted" || c.label === "unsupported");
  if (!bad.length) return <div className="small">未发现写错或无据的断言。</div>;
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 58 }}>分类</th>
          <th>断言</th>
          <th style={{ width: "38%" }}>原文依据</th>
        </tr>
      </thead>
      <tbody>
        {bad.map((c, i) => (
          <tr key={i} className={active && active.text === c.text ? "row-on" : ""}>
            <td>
              <span className={"chip " + (c.label === "contradicted" ? "bad" : "warn")}>
                {c.label === "contradicted" ? "写错" : "无据"}
              </span>
            </td>
            <td>
              {c.text}
              <div className="small" style={{ marginTop: 3 }}>{c.reason}</div>
            </td>
            <td className="small">
              {c.source_quote ? <code>{c.source_quote}</code> : <span style={{ color: "var(--muted)" }}>原文中无对应内容</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
