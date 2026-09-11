import { NextResponse } from "next/server";
import { DEFAULT_JUDGE_MODEL } from "@/lib/judge";

export const runtime = "nodejs";

// 从上游拉可用模型列表；拉不到就退化成只有一个默认模型。
// 不把模型名硬编码：换网关地址时不需要改代码。
export async function GET() {
  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const data = await res.json();
    const all = (data?.data || []).map((m) => m.id);
    const preferred = all.filter((m) => /^claude-(sonnet|opus|haiku)|^gpt-5|^gemini-3/.test(m));
    const models = preferred.length ? preferred : all;
    return NextResponse.json({
      models,
      default: models.includes(DEFAULT_JUDGE_MODEL) ? DEFAULT_JUDGE_MODEL : models[0] || DEFAULT_JUDGE_MODEL,
    });
  } catch {
    return NextResponse.json({ models: [DEFAULT_JUDGE_MODEL], default: DEFAULT_JUDGE_MODEL });
  }
}
