import { NextResponse } from "next/server";
import { judgeSummary, DEFAULT_JUDGE_MODEL } from "@/lib/judge";
import { RUBRIC_VERSION, CLAIM_LABELS, KEY_FACT_TYPES } from "@/lib/rubric";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "error", reason: "请求体不是合法 JSON" }, { status: 400 });
  }
  const source = String(body?.source ?? "");
  const summary = String(body?.summary ?? "");
  const model = String(body?.model || DEFAULT_JUDGE_MODEL);
  const promptVersion = String(body?.promptVersion || "");
  const temperature = body?.temperature;

  try {
    const result = await judgeSummary({
      source,
      summary,
      model,
      ...(promptVersion ? { promptVersion } : {}),
      ...(typeof temperature === "number" ? { temperature } : {}),
    });
    return NextResponse.json({
      ...result,
      rubric_version: RUBRIC_VERSION,
      labels: Object.entries(CLAIM_LABELS).map(([k, v]) => ({ key: k, ...v })),
      key_fact_types: KEY_FACT_TYPES,
    });
  } catch (e) {
    return NextResponse.json({ status: "error", reason: String(e.message || e) }, { status: 500 });
  }
}
