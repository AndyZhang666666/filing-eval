"use client";

// 覆盖率面板。这个项目的第二类失败是「没错但漏了」——
// 数字全对、方向全对，可是净利润下滑 8.3% 这句没写进去。
// 这种摘要幻觉率是 0，任何以"查错"为核心的指标都会给它满分，
// 但它实际是不能外发的：读者会以为公司经营平稳。
// 所以覆盖率必须和幻觉率并列展示，两个数字分开看。
export default function CoveragePanel({ keyFacts, coverage, broad }) {
  if (!keyFacts?.length) return <div className="small">未抽取到关键事实。</div>;
  const high = keyFacts.filter((f) => f.importance === "high");
  const rest = keyFacts.filter((f) => f.importance !== "high");

  const Row = ({ f }) => (
    <div className="kfrow">
      <span className={"kfdot " + (f.covered ? "ok" : "miss")}>{f.covered ? "✓" : "✗"}</span>
      <span className="kftype">{f.type}</span>
      <span className="kftext">
        {f.text}
        {f.note && <em>{f.note}</em>}
      </span>
    </div>
  );

  return (
    <div>
      <div className="covhead">
        <div>
          <div className="score-big">
            {coverage == null ? "—" : coverage.toFixed(2)}
            <small>关键信息覆盖率</small>
          </div>
          <div className="small" style={{ marginTop: 4 }}>
            只统计 high 重要度的硬信息（金额 / 比例 / 方向 / 主体 / 风险）。
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="small">
            含 medium 的宽口径：{broad == null ? "—" : broad.toFixed(2)}
          </div>
          <div className="small">
            {high.filter((f) => f.covered).length}/{high.length} 条 high 已覆盖
          </div>
        </div>
      </div>

      <div className="kflist">
        {high.map((f, i) => <Row key={i} f={f} />)}
      </div>

      {rest.length > 0 && (
        <details className="kfmore">
          <summary className="small">另有 {rest.length} 条 medium/low 信息（不参与覆盖率统计）</summary>
          <div className="kflist">{rest.map((f, i) => <Row key={i} f={f} />)}</div>
        </details>
      )}
    </div>
  );
}
