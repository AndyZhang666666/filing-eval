// 读 .env（不引入 dotenv，十行代码的事）
import fs from "node:fs";
import path from "node:path";
const p = path.resolve(process.cwd(), ".env");
if (fs.existsSync(p)) {
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
