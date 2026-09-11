// 第二个项目换了一套评测范式：不给人打分，而是把摘要拆成一条条「事实断言」，逐条对着原文验。
// 原因：主观质量（剧本好不好看）和客观忠实度（数字有没有改）是两类问题。
// 前者只能定 rubric 打分，后者可以做近乎二元的判定 —— 混在同一套指标里会互相污染。

export const RUBRIC_VERSION = "f1.0";

// 断言的四分类。关键是「contradicted」和「unsupported」必须分开：
// 前者是写错了（数字被改、方向说反），后者是原文里根本没有依据（凭空补细节）。
// 两者对业务的伤害不同 —— 写错的会被监管和法务抓，编造的会被用户抓 —— 修复动作也不同。
export const CLAIM_LABELS = {
  supported: {
    name: "有据",
    weight: 0,
    desc: "原文明确支持，数字、方向、主体完全一致",
  },
  contradicted: {
    name: "写错",
    weight: 1.0,
    desc: "原文有对应信息，但摘要写的与之矛盾：数字被改、正负号反了、主体张冠李戴、单位量级错",
  },
  unsupported: {
    name: "无据",
    weight: 0.8,
    desc: "原文里找不到依据，摘要自行补充了细节（原因、影响、时间、预测）",
  },
  not_checkable: {
    name: "无法核验",
    weight: 0,
    desc: "常识性表述或纯过渡语，不构成事实断言",
  },
};

// 关键信息遗漏：从原文里抽出「摘要本该提到」的硬信息。
// 只抽硬信息 —— 数字、金额、比例、主体、时间、方向性结论。
// 不抽「管理层认为」这类软表述，否则漏报率会虚高。
export const KEY_FACT_TYPES = [
  { key: "amount", name: "金额/规模", desc: "营收、利润、投资额、交易对价等具体金额及其单位" },
  { key: "ratio", name: "比例/幅度", desc: "同比、环比、占比、涨跌幅等百分比" },
  { key: "direction", name: "方向性结论", desc: "增长/下降/亏损/扭亏等方向，以及是否达到预期" },
  { key: "subject", name: "主体与关系", desc: "交易对手方、担保方、关联关系、标的公司名称" },
  { key: "timing", name: "时间", desc: "报告期、生效日、交割条件与时限" },
  { key: "risk", name: "风险与前提", desc: "明确的重大风险提示、不确定性、附条件事项" },
];

export function weightedHallucinationRate(claims) {
  // 幻觉率 = 加权(写错 + 无据) / 可核验断言总数。
  // 写错权重 1.0 > 无据 0.8：数字写错是硬伤，编造细节虽然也严重但通常不至于直接误导投资决策。
  const checkable = claims.filter((c) => c.label !== "not_checkable");
  if (!checkable.length) return null;
  const penalty = checkable.reduce((a, c) => a + (CLAIM_LABELS[c.label]?.weight ?? 0), 0);
  return Math.round((penalty / checkable.length) * 1000) / 1000;
}

// 关键信息覆盖率。这里有一个刻意的取舍，写在 README 里：
// 分母只算 importance === "high"，不算 medium。
// 原因：跑完第一轮发现，"medium" 是裁判的自由裁量区 —— 它会往这里放
// 「会议届次」「回购方式」这类省略了也合理的细节，导致干净摘要的覆盖率被压到 0.667，
// 看起来像摘要漏了重要信息，其实只是裁判把细枝末节也算了进去。
// 把 medium 计入分母，等于把裁判的裁量漂移直接变成摘要的扣分，指标会失真。
// 所以：headline 指标只看 high；medium 覆盖率另算一个 broad 值，只做参考、不参与判定。
export function coverageRate(keyFacts) {
  const critical = keyFacts.filter((f) => f.importance === "high");
  if (!critical.length) return null;
  const covered = critical.filter((f) => f.covered).length;
  return Math.round((covered / critical.length) * 1000) / 1000;
}

// 参考值：把 medium 也算进来。数字更保守，可以看到裁判的裁量区间有多宽。
// 不参与金标判定 —— 否则就是我们自己把噪声当信号。
export function coverageRateBroad(keyFacts) {
  const real = keyFacts.filter((f) => f.importance === "high" || f.importance === "medium");
  if (!real.length) return null;
  const covered = real.filter((f) => f.covered).length;
  return Math.round((covered / real.length) * 1000) / 1000;
}

// 数字归一化：把「1.2亿元」「120,000,000元」「1.2 亿」收成同一个数，
// 避免因为格式差异把正确的数字误判成 contradicted。只处理中文财务常见量级。
const UNITS = [
  { pat: /万亿/g, mul: 1e12 },
  { pat: /亿/g, mul: 1e8 },
  { pat: /千万/g, mul: 1e7 },
  { pat: /百万/g, mul: 1e6 },
  { pat: /万/g, mul: 1e4 },
];

export function normalizeNumbers(text) {
  const out = [];
  const re = /(-?\d[\d,，]*(?:\.\d+)?)\s*(万亿|千万|百万|亿|万)?\s*(元|美元|港元|人民币)?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const base = Number(m[1].replace(/[,，]/g, ""));
    if (!Number.isFinite(base)) continue;
    let mul = 1;
    if (m[2]) mul = UNITS.find((u) => u.pat.source.startsWith(m[2].slice(0, 2)))?.mul ?? 1;
    out.push({ raw: m[0].trim(), value: base * mul, unit: m[3] || null });
  }
  return out;
}
