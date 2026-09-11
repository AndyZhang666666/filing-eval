// 最小 LLM 客户端：只依赖 fetch，兼容 OpenAI Chat Completions 协议。
// 不引 SDK 的原因：这个项目只调一个接口，多一层依赖就多一层解释成本。

const BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const API_KEY = process.env.LLM_API_KEY;

// jsonMode：让上游强制返回合法 JSON。实测这个网关支持 response_format: json_object
// （json_schema 不支持，会被静默忽略），所以只在这一个档位上做约束，
// 剩下的字段结构仍然靠 prompt + 校验兜底。
export async function chat({ model, messages, temperature = 0, maxTokens = 3000, timeoutMs = 120000, jsonMode = false }) {
  if (!API_KEY) throw new Error("缺少 LLM_API_KEY，请在 .env 里配置");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${raw.slice(0, 300)}`);
    const data = JSON.parse(raw);
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string") throw new Error(`LLM 返回结构异常: ${raw.slice(0, 300)}`);
    return { content, usage: data.usage || null, finishReason: choice?.finish_reason || null };
  } finally {
    clearTimeout(timer);
  }
}

// 修 JSON 里最常见的两种模型手滑：
//   1) 把 JSON 包在 ``` 里，前后还带一句废话 —— 剥壳 + 首尾大括号截取
//   2) 在字符串值里直接用英文双引号（"第一句就用"37条消息"来……"）导致 JSON 非法 —— 状态机补转义
// 这两种都不是模型"不会"，是它没把输出当机器读取的对象。评测系统必须自己兜住。
function repairUnescapedQuotes(s) {
  let out = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      out += ch + (s[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') {
      if (!inString) {
        inString = true;
        out += ch;
        continue;
      }
      // 已经在一个字符串里：看后面第一个非空白字符，判断这是闭合引号还是内层引号
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      const next = s[j];
      const closing = next === undefined || next === "," || next === "}" || next === "]" || next === ":";
      if (closing) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

function trimToLastCompleteObject(s) {
  // 输出被 max_tokens 截断时，从尾部退回到最后一个能闭合的位置
  const end = s.lastIndexOf("}");
  if (end === -1) return null;
  return s.slice(0, end + 1);
}

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) throw new Error("输出里找不到 JSON 对象");

  const attempts = [];
  const end = candidate.lastIndexOf("}");
  if (end > start) attempts.push(candidate.slice(start, end + 1));
  const trimmed = trimToLastCompleteObject(candidate.slice(start));
  if (trimmed && !attempts.includes(trimmed)) attempts.push(trimmed);

  let lastErr = null;
  for (const raw of attempts) {
    const variants = [raw];
    const repaired = repairUnescapedQuotes(raw);
    if (repaired !== raw) variants.push(repaired);
    for (const v of variants) {
      try {
        return JSON.parse(v);
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw new Error(`JSON 解析失败：${lastErr?.message ?? "未知"}`);
}
