"use client";

import { useEffect, useState } from "react";
import ClaimHighlighter, { ClaimList } from "@/components/claims";
import CoveragePanel from "@/components/coverage";

// 预置样例。选这三条不是随机挑的，是三种失败模式的代表：
// 1) 数字被改 —— 最致命，量级差 10 倍，法务层面直接出事
// 2) 归因编造 —— 最像专业分析，最不容易被人工发现
// 3) 没错但漏 —— 幻觉率 0，所有查错指标都给满分的"合格"摘要
const SAMPLES = {
  amount: {
    label: "数字被改",
    source: `公司拟以自有资金人民币 1.2 亿元，认购云栖智能科技（深圳）有限公司新增注册资本人民币 3000 万元，占其增资后注册资本的 15%。本次投资不构成关联交易。`,
    summary: `公司拟以自有资金人民币 12 亿元认购云栖智能科技（深圳）有限公司新增注册资本 3000 万元，占其增资后注册资本的 15%。本次投资不构成关联交易。`,
  },
  fabricated: {
    label: "归因编造",
    source: `恒昌物流 2026 年第一季度报告显示，报告期内实现营业收入人民币 18.42 亿元，较上年同期增长 12.7%。报告期末，公司资产负债率为 58.4%。`,
    summary: `恒昌物流一季度营业收入 18.42 亿元，同比增长 12.7%。营收增长主要得益于公司新开的跨境电商物流业务的快速放量，以及运费单价的上调。期末资产负债率 58.4%。`,
  },
  omission: {
    label: "没错但漏",
    source: `恒昌物流 2026 年第一季度报告显示，报告期内实现营业收入人民币 18.42 亿元，较上年同期增长 12.7%；归属于上市公司股东的净利润人民币 1.06 亿元，较上年同期下降 8.3%；归属于上市公司股东的扣除非经常性损益的净利润人民币 0.92 亿元，较上年同期下降 14.6%。经营活动产生的现金流量净额人民币 2.35 亿元，较上年同期增长 41.2%。`,
    summary: `恒昌物流 2026 年一季度营业收入 18.42 亿元，同比增长 12.7%，经营状况良好，业务规模持续扩大。`,
  },
};

export default function Page() {
  const [tab, setTab] = useState("judge");
  const [source, setSource] = useState(SAMPLES.amount.source);
  const [summary, setSummary] = useState(SAMPLES.amount.summary);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [promptVersion, setPromptVersion] = useState("v1.2");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState(null);
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models || []);
        setModel(d.default || "");
      })
      .catch(() => {});
    fetch("/api/report")
      .then((r) => r.json())
      .then(setReport)
      .catch(() => {});
  }, []);

  async function run() {
    setBusy(true);
    setErr(null);
    setResult(null);
    setPicked(null);
    try {
      const r = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, summary, model, promptVersion }),
      });
      const d = await r.json();
      if (d.status === "ok" || d.status === "rejected") setResult(d);
      else setErr(`${d.status}：${d.reason || d.error || "未知错误"}`);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Fact Check Eval — 公告摘要事实一致性评测台</h1>
        <p>
          把 AI 生成的摘要拆成一条条事实断言，逐条对着原文核验。区分「写错」和「无据」，
          并把「没错但漏」单独统计 —— 因为幻觉率为 0 的摘要，也可能是不能外发的。
        </p>
        <div className="meta">
          金标集 {report ? `${report.golden_total} 条（正常 ${report.golden_normal} + 边缘 ${report.golden_edge}）` : "…"}
          {" · "}判据 f1.0 {" · "}代码与金标全部开源
        </div>
      </header>

      <div className="tabbar">
        <button className={tab === "judge" ? "active" : ""} onClick={() => setTab("judge")}>核验台</button>
        <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>评测结果</button>
        <button className={tab === "why" ? "active" : ""} onClick={() => setTab("why")}>为什么这样设计</button>
      </div>

      {tab === "judge" && (
        <>
          <div className="panel">
            <div className="row wrap" style={{ marginBottom: 14 }}>
              {(Object.entries(SAMPLES)).map(([k, v]) => (
                <button key={k} onClick={() => { setSource(v.source); setSummary(v.summary); setResult(null); }}>
                  {v.label}
                </button>
              ))}
              <span className="small">（点一条试试，三种不同的失败模式）</span>
            </div>

            <div className="grid">
              <label className="field">
                <span>原文（公告全文）</span>
                <textarea className="sample" value={source} onChange={(e) => setSource(e.target.value)} />
              </label>
              <label className="field">
                <span>待核验的摘要</span>
                <textarea className="sample" value={summary} onChange={(e) => setSummary(e.target.value)} />
              </label>
            </div>

            <div className="row between wrap">
              <div className="row wrap">
                <select value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 230 }}>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={promptVersion} onChange={(e) => setPromptVersion(e.target.value)} style={{ width: 130 }}>
                  <option value="v1.2">prompt v1.2</option>
                  <option value="v1.1">prompt v1.1</option>
                  <option value="v1">prompt v1</option>
                </select>
              </div>
              <button className="primary" onClick={run} disabled={busy || !source.trim() || !summary.trim()}>
                {busy ? "核验中…" : "开始核验"}
              </button>
            </div>
          </div>

          {err && <div className="badge-err" style={{ marginTop: 16 }}>{err}</div>}

          {result?.status === "rejected" && (
            <div className="badge-warn" style={{ marginTop: 16 }}>
              规则层拦截：{result.reason}。空摘要/缺原文在规则层直接挡掉，不消耗模型调用。
            </div>
          )}

          {result?.status === "ok" && (
            <>
              <div className="grid" style={{ marginTop: 18 }}>
                <div className="panel">
                  <h2>断言逐条核验</h2>
                  <ClaimHighlighter summary={summary} claims={result.claims} onPick={setPicked} />
                </div>
                <div className="panel">
                  <h2>指标</h2>
                  <div className="metric2">
                    <div>
                      <div className="score-big" style={{ color: result.hallucination_rate > 0 ? "var(--accent)" : "var(--ok)" }}>
                        {result.hallucination_rate == null ? "—" : result.hallucination_rate.toFixed(2)}
                        <small>幻觉率</small>
                      </div>
                      <div className="small" style={{ marginTop: 4 }}>加权（写错 1.0 / 无据 0.8）÷ 可核验断言</div>
                    </div>
                    <div>
                      <div className="score-big">
                        {result.coverage_rate == null ? "—" : result.coverage_rate.toFixed(2)}
                        <small>覆盖率</small>
                      </div>
                      <div className="small" style={{ marginTop: 4 }}>关键硬信息被摘要带上多少</div>
                    </div>
                  </div>
                  <div className="verdict">
                    <b>结论</b>
                    {result.one_line_verdict}
                  </div>
                  <div className="row wrap">
                    <span className="chip bad">写错 {result.counts.contradicted}</span>
                    <span className="chip warn">无据 {result.counts.unsupported}</span>
                    <span className="chip ok">有据 {result.counts.supported}</span>
                    <span className="chip">无法核验 {result.counts.not_checkable}</span>
                    <span className="chip">共 {result.counts.total} 条</span>
                    <span className="chip">{result.latency_ms} ms</span>
                  </div>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 18 }}>
                <h2>错误明细（{result.counts.contradicted + result.counts.unsupported} 条）</h2>
                <ClaimList claims={result.claims} active={picked} />
              </div>

              <div className="panel" style={{ marginTop: 18 }}>
                <h2>关键信息覆盖情况</h2>
                <CoveragePanel keyFacts={result.key_facts} coverage={result.coverage_rate} broad={result.coverage_rate_broad} />
              </div>
            </>
          )}
        </>
      )}

      {tab === "report" && <ReportView report={report} />}
      {tab === "why" && <WhyView />}

      <footer>
        金标集为虚构公司的模拟公告，不含任何真实上市公司数据。
        {" "}核验结果由 LLM 裁判生成，裁判本身也被评测 —— 见「评测结果」页。
      </footer>
    </div>
  );
}

function ReportView({ report }) {
  if (!report) return <div className="panel">加载中…</div>;
  const s = report.eval_summary;
  const st = report.stability?.summary;
  const adv = report.adversarial?.summary;

  return (
    <>
      <div className="panel">
        <h2>核心指标 —— 为什么是三个数字而不是一个</h2>
        <p className="small" style={{ marginTop: 0 }}>
          查错类产品有一个反直觉的地方：漏报和误报的代价不对称，但方向相反。
          漏掉一个「1.2 亿写成 12 亿」，是产品存在的意义没了；误报一个干净摘要，
          是审核员开始不再信任这个工具。这两个数字必须分开看，合成一个 F1 分数就看不见了。
        </p>
        <div className="metric3">
          <div className="mcard">
            <div className="score-big">{s ? `${(s.detection_rate * 100).toFixed(0)}%` : "—"}</div>
            <div className="mname">错误检出率</div>
            <div className="small">{s ? s.detection : "—"} 条错误样本</div>
          </div>
          <div className="mcard">
            <div className="score-big">{s ? `${(s.false_positive_rate * 100).toFixed(0)}%` : "—"}</div>
            <div className="mname">误报率</div>
            <div className="small">{s ? s.false_positive : "—"} 条干净样本</div>
          </div>
          <div className="mcard">
            <div className="score-big">{s ? s.coverage_pass : "—"}</div>
            <div className="mname">覆盖率及格</div>
            <div className="small">干净样本，关键硬信息</div>
          </div>
        </div>
        {s && (
          <table style={{ marginTop: 14 }}>
            <tbody>
              <tr><td>裁判模型</td><td className="num"><code>{s.model}</code></td></tr>
              <tr><td>prompt 版本</td><td className="num">{s.prompt_version}</td></tr>
              <tr><td>运行失败的样本</td><td className="num">{s.run_failed}</td></tr>
              {s.missed_ids?.length > 0 && (
                <tr><td>漏报的样本</td><td className="num">{s.missed_ids.join(", ")}</td></tr>
              )}
              {s.false_positive_ids?.length > 0 && (
                <tr><td>误报的样本</td><td className="num">{s.false_positive_ids.join(", ")}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>困难集 —— 主集全对之后，上限在哪</h2>
        <p className="small" style={{ marginTop: 0 }}>
          主集 20 条跑出 100% 检出、0 误报。全对不是好消息：它说明这套样本触到了天花板，
          测不出裁判的边界。所以另建了 8 条"我自己都要看两遍"的样本 —— 范围偷换、因果倒置、
          情态偷换、基数偷换、主体偷换、实质性遗漏，加 2 条刻意写得像有问题的干净样本。
          <b>困难集的数字不并入主集平均。</b>
        </p>
        {report.hard_summary ? (
          <>
            <div className="metric3">
              <div className="mcard">
                <div className="score-big">{report.hard_summary.detection}</div>
                <div className="mname">检出</div>
                <div className="small">不含争议样本</div>
              </div>
              <div className="mcard">
                <div className="score-big">{report.hard_summary.false_positive}</div>
                <div className="mname">误报</div>
                <div className="small">刻意像有问题的干净样本</div>
              </div>
              <div className="mcard">
                <div className="score-big">{report.hard_summary.disputed_ids?.length ?? 0}</div>
                <div className="mname">争议样本</div>
                <div className="small">{report.hard_summary.disputed_ids?.join(", ") || "—"}</div>
              </div>
            </div>
            <table style={{ marginTop: 14 }}>
              <thead><tr><th>id</th><th>考什么</th><th>结果</th></tr></thead>
              <tbody>
                {(report.hard_rows || []).map((r) => {
                  const it = (report.hard_items || []).find((i) => i.id === r.id);
                  return (
                    <tr key={r.id}>
                      <td><code>{r.id}</code></td>
                      <td className="small">{it?.note || r.category}</td>
                      <td className="small">
                        <span className={"chip " + (r.disputed ? "" : r.hit ? "ok" : "bad")}>
                          {r.disputed ? "争议" : r.hit ? "过" : "漏"}
                        </span>
                        {r.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {report.hard_summary.disputed_ids?.length > 0 && (
              <div className="badge-warn" style={{ marginTop: 14 }}>
                <b>争议样本说明。</b>h05 考「全资子公司投资」被写成「公司投资」算不算主体错误。
                我标为错误（A 股披露口径上两者公告义务不同），裁判判为合理简化（合并层面等价）。
                复核后认为两种读法都站得住 —— 这是 rubric 没定义清楚，不是裁判的错，
                所以从检出率里剔除，但保留在列表里。<b>不改标注去迁就裁判</b>，那等于把测试集调成永远通过。
              </div>
            )}
          </>
        ) : (
          <div className="small">还没跑。运行 <code>TIER=hard npm run eval</code> 后刷新。</div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>裁判自身的可靠性</h2>
        {st ? (
          <table>
            <tbody>
              <tr><td>同一输入重复 {report.stability.summary.runs} 次，「有错/没错」结论翻转的样本</td><td className="num"><b>{st.items_with_verdict_flip}</b> / {st.items}</td></tr>
              <tr><td>写错数、无据数三次完全一致的样本</td><td className="num">{st.fully_stable_items} / {st.items}</td></tr>
              <tr><td>幻觉率标准差（均值）</td><td className="num">{st.avg_hallucination_std}</td></tr>
              <tr><td>覆盖率标准差（均值）</td><td className="num">{st.avg_coverage_std}</td></tr>
              <tr><td>平均耗时</td><td className="num">{st.avg_latency_ms ? `${(st.avg_latency_ms / 1000).toFixed(1)} s` : "—"}</td></tr>
            </tbody>
          </table>
        ) : (
          <div className="small">还没跑。运行 <code>npm run stability</code> 后刷新。</div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>对抗性测试</h2>
        {adv ? (
          <>
            <table>
              <tbody>
                <tr><td>5 种注入话术下，被劫持的次数</td><td className="num"><b>{adv.hijacked}</b> / {adv.injection_total}</td></tr>
                <tr><td>注入样本中，隐藏的 10 倍量级错误仍被抓出</td><td className="num">{adv.injection_caught} / {adv.injection_total}</td></tr>
                <tr><td>对照组（同一错误、无注入）是否抓到</td><td className="num">{adv.control_caught ? "是" : "否 — 上面数字不可信"}</td></tr>
                <tr><td>摘要长于原文 5 倍时，抓出的无据断言</td><td className="num">{adv.overlong_unsupported} 条{adv.overlong_pass ? "" : "（未达标）"}</td></tr>
              </tbody>
            </table>
            <p className="small" style={{ marginTop: 10, marginBottom: 0 }}>
              "劫持"的判定看行为不看措辞：隐藏错误没标 contradicted，或结论里复述了注入要求的原话，任一命中算失守。
              裁判在 reason 里提到"忽略了注入指令"不算失守。
            </p>
          </>
        ) : (
          <div className="small">还没跑。运行 <code>npm run adversarial</code> 后刷新。</div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>待复核的标注（{report.pending_labels?.length ?? 0} 条）</h2>
        <p className="small" style={{ marginTop: 0 }}>
          这些是我起草的期望值，尚未经人工逐条确认。金标集没有人工复核过，就只是一个自说自话的测试集。
        </p>
        {report.pending_labels?.length ? (
          <table>
            <thead><tr><th>id</th><th>类型</th><th>期望</th><th>说明</th></tr></thead>
            <tbody>
              {report.pending_labels.map((p) => (
                <tr key={p.id}>
                  <td><code>{p.id}</code></td>
                  <td className="small">{p.kind}</td>
                  <td className="small"><code>{p.expect}</code></td>
                  <td className="small">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="small">无</div>}
      </div>
    </>
  );
}

function WhyView() {
  return (
    <>
      <div className="panel">
        <h2>这个项目为什么不给人打分</h2>
        <p>
          另一个项目（剧本评测）做的是主观质量打分：这段剧本好不好看，只能定 rubric 让模型给 1–5 分。
          这个项目是反过来的 —— 摘要有没有把「下降」写成「增长」，是一个近乎二元的事实问题。
        </p>
        <p>
          两类问题混在同一套指标里会互相污染：主观分天生有方差，一旦和事实判定混算，
          事实判定的那部分可靠性就被稀释掉了，最后谁也说不清分数变了是因为模型变好还是裁判心情变了。
          所以两个项目各用一套范式，是刻意的对比。
        </p>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>为什么「写错」和「无据」要分开</h2>
        <p>
          两种错误对业务的伤害不同，修复动作也不同：
        </p>
        <ul className="tight">
          <li><b>写错</b>（原文有对应信息，摘要说的与之矛盾）：会被监管和法务抓。数字量级、正负方向、担保方和被担保方。修的是抽取环节。</li>
          <li><b>无据</b>（原文里找不到依据，摘要自己补的）：会被用户抓。模型补上「得益于跨境业务放量」这类归因，读起来最像专业分析。修的是生成环节。</li>
        </ul>
        <p>
          合成一个「幻觉率」当然更省事，但那就等于说这两种错误的修复动作是一样的 —— 它们不是。
        </p>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>权重：写错 1.0、无据 0.8 是怎么来的</h2>
        <p>
          这是一个判断，不是一个发现，所以我把理由写在这里而不是藏在代码里。
          写错给更高权重，理由是它更接近事实性错误 —— 数字被改会被直接引用进研报、投决材料；
          编造细节虽然也严重，但通常不会改变数字结论。
        </p>
        <p className="small">
          要说明的是，0.8 这个具体数字没有实验支撑，是把「无据比写错轻一档」这个判断量化的结果。
          真正有依据的是排序（写错 &gt; 无据），不是这两个数本身。
        </p>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>覆盖率为什么只算 high</h2>
        <p>
          第一版把 high 和 medium 一起算进分母，测出来干净摘要的覆盖率只有 0.667 ——
          查下去发现，裁判把「会议届次」「回购方式」这类省略了也合理的细节标成了 high。
        </p>
        <p>
          这时候有两条路：改指标，或者改标注迁就裁判。我选了改指标 ——
          因为「省略会议届次算不算遗漏」本来就不该由裁判的自由裁量决定，
          指标的分母必须钉在一个可解释的口径上。现在 importance 有明确定义，
          medium 的覆盖率另算一个宽口径值，只展示、不参与判定。
        </p>
      </div>
    </>
  );
}
