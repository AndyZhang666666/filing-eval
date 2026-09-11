import "./_env.mjs";
import { buildJudgePrompt } from "../lib/judge.js";
const m = buildJudgePrompt({ source: "原文", summary: "摘要" });
console.log("system length:", m[0].content.length);
console.log("---- 开头 ----"); console.log(m[0].content.slice(0, 500));
console.log("---- 结尾 ----"); console.log(m[0].content.slice(-500));
