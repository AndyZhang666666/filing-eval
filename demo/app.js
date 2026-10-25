/* Public synthetic fixtures only; no API calls, no telemetry. */
import {
  locateQuote,
  reviewKey,
  targetRecord,
  decodeReviews,
  exportReviews,
  decisions,
} from "./review-core.js";
const $ = (id) => document.getElementById(id);
const labels = {
  supported: "有据",
  contradicted: "写错",
  unsupported: "无据",
  not_checkable: "无法核验",
};
const names = {
  f05: "数字量级 · 1.2 亿变成 12 亿",
  f11: "无据归因 · 增长原因从哪里来",
  f01: "干净对照 · 不该报错的摘要",
  h05: "主体争议 · 子公司还是公司",
  h06: "重大遗漏 · 没有错句也不能忽略",
  e04: "注入边界 · 摘要中的指令不应被执行",
};
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let dataset,
  selected,
  picked = 0,
  kind = "claim",
  reviews = {},
  drafts = {},
  storageAvailable = true,
  storageMessage = "";
const key = () => `filing-review-${dataset.version}`;
const current = () => dataset.samples.find((s) => s.id === selected);
const claimKey = () => reviewKey(selected, kind, picked);

function renderClaims() {
  const s = current(),
    claims = s.judge.claims || [],
    filter = $("filter").value;
  const shown = claims
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => filter === "all" || c.label === filter);
  if (kind === "claim" && !shown.some((v) => v.i === picked))
    picked = shown[0]?.i ?? -1;
  $("claims").innerHTML = shown.length
    ? shown
        .map(
          ({ c, i }) =>
            `<button class="claim" data-claim="${i}" aria-pressed="${kind === "claim" && i === picked}"><span class="claim-top"><span class="label ${esc(c.label)}">${esc(labels[c.label] || c.label)}</span><span class="reviewed">${reviews[reviewKey(selected, "claim", i)] ? "已留复核" : "待复核"}</span></span>${esc(c.text)}</button>`,
        )
        .join("")
    : `<p class="empty">${claims.length ? "这个筛选下没有断言，切回“全部断言”继续。" : `历史记录状态：${esc(s.judge.status)}。${esc(s.judge.reason || "没有可展示的核验结果。")}`}</p>`;
  $("claims")
    .querySelectorAll("[data-claim]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        kind = "claim";
        picked = Number(b.dataset.claim);
        renderClaims();
        renderEvidence();
        $("claims")
          .querySelector(`[data-claim="${picked}"]`)
          ?.focus({ preventScroll: true });
      }),
    );
}

function renderEvidence() {
  $("coverage")
    .querySelectorAll("[data-fact]")
    .forEach((b) =>
      b.setAttribute(
        "data-reviewed",
        String(
          Boolean(reviews[reviewKey(selected, "fact", Number(b.dataset.fact))]),
        ),
      ),
    );
  $("coverage")
    .querySelectorAll("[data-fact]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(kind === "fact" && Number(b.dataset.fact) === picked),
      ),
    );
  const s = current(),
    original = targetRecord(dataset, selected, kind, picked)?.original;
  const c =
    kind === "fact" && original
      ? {
          ...original,
          label: original.covered ? "supported" : "unsupported",
          reason: original.note || "请分别核对重要性和摘要是否确实覆盖。",
        }
      : original;
  const loc = c && locateQuote(s.source, c.source_quote);
  $("source").innerHTML = loc
    ? `${esc(s.source.slice(0, loc.start))}<mark>${esc(s.source.slice(loc.start, loc.end))}</mark>${esc(s.source.slice(loc.end))}`
    : esc(s.source || "此边界样本未提供原文。");
  $("quote-state").textContent = !c
    ? "选择其他断言或样本后继续核验。"
    : loc
      ? `${loc.method}定位引句；定位成功本身不代表推理成立。`
      : kind === "fact"
        ? "正在核对覆盖判断：请对照原文和摘要，分别确认重要性与是否遗漏。未提供引句时不伪造高亮。"
        : c.source_quote
          ? "引句未能逐字定位。请核对全文，不能将模型引文直接当证据。"
          : "没有直接引句；“无据”表示给定原文未支持，不等于外部世界必然为假。";
  $("review-title").textContent =
    kind === "fact" ? "复核关键事实与遗漏" : "复核当前断言";
  $("review-target").textContent = c
    ? kind === "fact"
      ? `关键事实：${c.text}（历史判断：${c.covered ? "已覆盖" : "待补充"} / ${c.importance}）`
      : `断言：${c.text}`
    : "当前没有可复核的目标。";
  $("reason").innerHTML = c
    ? `<p><strong>历史裁判判断：${esc(kind === "fact" ? (c.covered ? "已覆盖" : "待补充") : labels[c.label] || c.label)}</strong></p><p>${esc(c.reason)}</p>${c.source_quote ? `<p class="meta">模型引用：${esc(c.source_quote)}</p>` : ""}${s.disputed ? '<p class="meta">该样本原标注与裁判存在分歧，已从检出率分母排除。请先明确“合并口径”和“披露主体”的适用范围，再裁决。</p>' : ""}`
    : "";
  const r = drafts[claimKey()] || reviews[claimKey()];
  $("review-state").value = r?.decision || "";
  $("review-note").value = r?.note || "";
  $("review-feedback").textContent = drafts[claimKey()]
    ? "未保存的草稿仍保留在当前会话，点“保存本地复核”才能跨刷新保留。"
    : r
      ? `本机已保存 · ${new Date(r.at).toLocaleString()}`
      : "";
  $("review-form").querySelector("button").disabled = !c;
}

function renderCase() {
  const s = current();
  picked = 0;
  kind = "claim";
  $("filter").value = "all";
  history.replaceState(null, "", `#${s.id}`);
  $("summary").textContent = s.summary || "此边界样本摘要为空。";
  $("case-note").textContent = s.note || s.tags.join(" / ");
  const claims = s.judge.claims || [];
  const counts = Object.fromEntries(
    Object.keys(labels).map((l) => [
      l,
      claims.filter((c) => c.label === l).length,
    ]),
  );
  $("case-facts").innerHTML = Object.entries(counts)
    .map(
      ([l, n]) => `<div><strong>${n}</strong><span>${labels[l]}</span></div>`,
    )
    .join("");
  $("coverage").innerHTML =
    (s.judge.key_facts || [])
      .map(
        (f, i) =>
          `<div class="coverage-row"><span class="label ${f.covered ? "supported" : "unsupported"}">${f.covered ? "已覆盖" : "待补充"} · ${esc(f.importance)}</span><div>${esc(f.text)}<p class="meta">${esc(f.note)}</p><button class="coverage-review" data-fact="${i}">复核这条覆盖判断</button></div></div>`,
      )
      .join("") ||
    '<p class="empty">此记录没有关键事实覆盖结果，不能据此判断信息完整。</p>';
  $("coverage")
    .querySelectorAll("[data-fact]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        kind = "fact";
        picked = Number(b.dataset.fact);
        renderClaims();
        renderEvidence();
        jumpToReview();
      }),
    );
  renderClaims();
  renderEvidence();
  updateStatus();
}

function updateStatus(message = "") {
  const s = current(),
    done = Object.values(reviews).filter((r) => r.sampleId === selected).length,
    total = (s.judge.claims?.length || 0) + (s.judge.key_facts?.length || 0);
  $("status").textContent =
    message ||
    `${s.id} · 本场景 ${done}/${total} 项已留复核（断言与覆盖分开记录） · 全部 ${Object.keys(reviews).length} 项。不上传。${storageMessage}${storageAvailable ? "" : " 当前无法持久保存，请及时导出。"}`;
}

function jumpToReview() {
  $("review-title").scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
  $("review-state").focus({ preventScroll: true });
}

function renderReport() {
  const rows = (s) =>
    `<table class="report-table"><tbody><tr><th>构造样本数</th><td>${s.items}</td></tr><tr><th>错误检出（仅当前构造集）</th><td>${esc(s.detection)}</td></tr><tr><th>干净样本误报</th><td>${esc(s.false_positive)}</td></tr><tr><th>争议样本</th><td>${esc(s.disputed_ids.join(", ") || "无")}</td></tr></tbody></table>`;
  $("report").innerHTML =
    `<div class="report-grid"><section class="panel"><h2>主集 · 回归基线</h2>${rows(dataset.summaries.main)}</section><section class="panel"><h2>困难集 · 不并入主集</h2>${rows(dataset.summaries.hard)}</section></div><section class="panel"><h2>哪些结论现在还不能下</h2><ul><li>全部公告为模拟材料；上述成绩不是对真实上市公司公告的生产准确率。</li><li>仅一位历史裁判模型；预期标签没有完成独立人工逐条复核。</li><li>固定温度下结果稳定，不代表判断正确；引文能定位也不代表支持断言。</li><li>主体争议 h05 保留，不改标签迁就裁判；遗漏 h06 单独通过覆盖情况检查。</li><li>本机复核不改原始金标或历史统计。当前没有新跑模型，也没有新增已验证效果。</li></ul><h3>下一轮该怎么验证</h3><p>先独立复核标注，再冻结规则，用未参与调参的样本测试。仓库新增了单独的候选留出集，仅供后续复核，尚未调用模型、不得计入成绩。</p><a href="https://github.com/AndyZhang666666/filing-eval/tree/main/results">原始历史结果</a> · <a href="https://github.com/AndyZhang666666/filing-eval/blob/main/docs/REVIEW_PROTOCOL.md">复核协议与候选留出集</a></section>`;
}

function showProvenance() {
  $("report").insertAdjacentHTML(
    "afterbegin",
    `<p class="meta">历史裁判 ${esc(dataset.provenance.model)} · 提示词 ${esc(dataset.provenance.prompt)} · 数据版本 ${esc(dataset.version)}。源文件 ${esc(dataset.provenance.source)}；运行记录 ${esc(dataset.provenance.results.join(" / "))}。本轮没有重新调用模型。</p>`,
  );
}

$("filter").addEventListener("change", () => {
  kind = "claim";
  renderClaims();
  renderEvidence();
});
$("jump-review").addEventListener("click", () => {
  const s = current();
  let next;
  for (const type of ["claim", "fact"]) {
    const list = type === "claim" ? s.judge.claims : s.judge.key_facts;
    const index =
      list?.findIndex((_, i) => !reviews[reviewKey(selected, type, i)]) ?? -1;
    if (index >= 0) {
      next = { type, index };
      break;
    }
  }
  if (next) {
    kind = next.type;
    picked = next.index;
    $("filter").value = "all";
    renderClaims();
    renderEvidence();
  } else updateStatus("本场景全部目标已留复核；可导出核查，不构成发布许可。");
  jumpToReview();
});
$("sample").addEventListener("change", () => {
  selected = $("sample").value;
  renderCase();
});
document.querySelectorAll("[data-view]").forEach((b) =>
  b.addEventListener("click", () => {
    document
      .querySelectorAll("[data-view]")
      .forEach((n) => n.setAttribute("aria-pressed", String(n === b)));
    $("desk").hidden = b.dataset.view !== "desk";
    $("report").hidden = b.dataset.view !== "report";
  }),
);
$("review-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const note = $("review-note").value.trim(),
    decision = $("review-state").value;
  if (
    !targetRecord(dataset, selected, kind, picked) ||
    !decisions.includes(decision)
  ) {
    $("review-feedback").textContent =
      "先选择当前目标的复核结论，不默认同意历史判断。";
    return;
  }
  if (decision !== "agree" && !note) {
    $("review-feedback").textContent =
      "请写明不同意或保留争议的依据，避免只留一个标签。";
    $("review-note").focus();
    return;
  }
  reviews[claimKey()] = {
    sampleId: selected,
    kind,
    index: picked,
    decision,
    note,
    at: new Date().toISOString(),
  };
  delete drafts[claimKey()];
  try {
    localStorage.setItem(key(), JSON.stringify(reviews));
    storageMessage = "";
  } catch {
    storageAvailable = false;
  }
  renderClaims();
  renderEvidence();
  updateStatus();
});
$("export").addEventListener("click", () => {
  const contents = exportReviews(dataset, reviews, drafts);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(contents, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "filing-review.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  updateStatus(
    `${Object.keys(reviews).length ? "已导出本地复核、原文、摘要及原始判断。" : "已导出空复核记录，不伪造已完成审核。"}${Object.keys(drafts).length ? " 有未保存草稿，未计入复核文件，请保存后重新导出。" : ""}`,
  );
});
for (const id of ["review-state", "review-note"])
  $(id).addEventListener("input", () => {
    if (picked < 0) return;
    drafts[claimKey()] = {
      decision: $("review-state").value,
      note: $("review-note").value,
    };
    $("review-feedback").textContent =
      "复核草稿未保存；切换断言仍保留，刷新前请保存。";
  });

async function init() {
  try {
    const response = await fetch("./data.json");
    if (!response.ok) throw new Error("读取失败");
    dataset = await response.json();
    let raw;
    try {
      raw = localStorage.getItem(key());
    } catch {
      storageAvailable = false;
    }
    try {
      reviews = decodeReviews(raw, dataset);
    } catch {
      reviews = {};
      storageMessage = "本机复核记录损坏，未将其计入已复核；原存储未覆盖。";
    }
    const order = ["f05", "f11", "f01", "h05", "h06", "e04"];
    const sorted = [...dataset.samples].sort(
      (a, b) =>
        (order.includes(a.id) ? order.indexOf(a.id) : 99) -
        (order.includes(b.id) ? order.indexOf(b.id) : 99),
    );
    $("sample").innerHTML = sorted
      .map(
        (s) =>
          `<option value="${s.id}">${esc(names[s.id] || `${s.id} · ${s.note || s.tags.join(" / ")}`)}</option>`,
      )
      .join("");
    const initial = location.hash.slice(1);
    selected = dataset.samples.some((s) => s.id === initial) ? initial : "f05";
    $("sample").value = selected;
    $("desk").hidden = false;
    $("export").disabled = false;
    $("jump-review").disabled = false;
    renderCase();
    renderReport();
    showProvenance();
  } catch {
    updateLoadError();
  }
}
function updateLoadError() {
  $("status").innerHTML =
    '历史数据未能读取，未丢失本地复核。<button id="retry">重试读取</button> 或<a href="https://github.com/AndyZhang666666/filing-eval/tree/main/results">查看仓库结果</a>。';
  $("retry").addEventListener("click", init);
}
init();
window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (dataset?.samples.some((s) => s.id === id) && id !== selected) {
    selected = id;
    $("sample").value = id;
    renderCase();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (Object.keys(drafts).length) {
    e.preventDefault();
    e.returnValue = "";
  }
});
