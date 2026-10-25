import assert from "node:assert/strict";
import fs from "node:fs";
import { locateQuote } from "../demo/review-core.js";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const url = process.env.TEST_URL || "http://127.0.0.1:8805/";
const out = process.env.EVIDENCE_DIR || "/tmp/filing-browser";
fs.mkdirSync(out, { recursive: true });
const dataset = JSON.parse(
  fs.readFileSync(new URL("../demo/data.json", import.meta.url)),
);
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1000 },
});
const p = await ctx.newPage(),
  errors = [],
  network = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("request", (r) => {
  if (r.method() !== "GET") network.push(r.method() + " " + r.url());
});
async function ready(page = p) {
  await page.waitForFunction(
    () => document.querySelector("#sample")?.options.length === 28,
  );
}
async function select(id) {
  await p.locator("#sample").selectOption(id);
  await p.waitForFunction(
    (id) =>
      document.querySelector("#status")?.textContent?.startsWith(id + " ·"),
    id,
  );
}
async function download() {
  const pending = p.waitForEvent("download");
  await p.locator("#export").click();
  const d = await pending;
  await d.saveAs(out + "/review.json");
  return JSON.parse(fs.readFileSync(out + "/review.json", "utf8"));
}
try {
  await p.goto(url);
  await ready();
  assert.equal(await p.locator("#review-state").inputValue(), "");
  let checked = 0,
    matched = 0;
  for (const sample of dataset.samples) {
    await select(sample.id);
    assert.equal(
      await p.locator("#summary").innerText(),
      sample.summary || "此边界样本摘要为空。",
    );
    const claims = sample.judge.claims || [];
    assert.equal(await p.locator("[data-claim]").count(), claims.length);
    for (let i = 0; i < claims.length; i++) {
      const button = p.locator(`[data-claim="${i}"]`);
      await button.focus();
      await p.keyboard.press("Enter");
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      assert.equal(
        await p.evaluate(() => document.activeElement?.dataset.claim),
        String(i),
      );
      const loc = locateQuote(sample.source, claims[i].source_quote);
      assert.equal(await p.locator("#source mark").count(), loc ? 1 : 0);
      if (loc) {
        assert.equal(
          await p.locator("#source mark").innerText(),
          sample.source.slice(loc.start, loc.end),
        );
        matched++;
      }
      checked++;
    }
  }
  assert.equal(checked, 102);
  await select("f05");
  await p.locator("#jump-review").click();
  assert.equal(await p.locator("#review-state").inputValue(), "");
  assert.equal(
    await p.evaluate(() => document.activeElement?.id),
    "review-state",
  );
  await p.locator("#review-form button").click();
  assert.equal(
    await p.locator("#review-state").evaluate((el) => el.validity.valueMissing),
    true,
  );
  assert.match(await p.locator("#status").innerText(), /0\/7/);
  await p.locator("#review-state").selectOption("disagree");
  await p.locator("#review-form button").click();
  assert.match(await p.locator("#review-feedback").innerText(), /写明/);
  await p
    .locator("#review-note")
    .fill("数字量级需要回到原文核查，暂不能发布。");
  await p.locator("#review-form button").click();
  assert.match(await p.locator("#status").innerText(), /1\/7/);
  await select("f01");
  await select("f05");
  assert.equal(await p.locator("#review-state").inputValue(), "disagree");
  await p.reload();
  await ready();
  assert.equal(await p.locator("#review-state").inputValue(), "disagree");
  await p.locator("#filter").selectOption("unsupported");
  assert.match(await p.locator("#claims").innerText(), /没有断言/);
  assert.ok(await p.locator("#review-form button").isDisabled());
  await select("h06");
  await p.locator("[data-fact]").first().click();
  assert.match(await p.locator("#review-title").innerText(), /关键事实/);
  assert.equal(await p.locator("#review-state").inputValue(), "");
  await p.locator("#review-state").selectOption("needs-review");
  await p
    .locator("#review-note")
    .fill("核对否决意见是否应列为重要信息；覆盖与事实错误分开裁决。");
  await p.locator("#review-form button").click();
  assert.equal(
    await p.locator("[data-fact]").first().getAttribute("data-reviewed"),
    "true",
  );
  const report = await download();
  assert.equal(report.reviews.length, 2);
  assert.ok(report.reviews.some((r) => r.kind === "fact"));
  assert.ok(
    report.reviews.every(
      (r) =>
        typeof r.sourceText === "string" &&
        typeof r.summary === "string" &&
        r.originalRecord,
    ),
  );
  assert.equal(report.datasetVersion, dataset.version);
  await p.locator("#jump-review").click();
  assert.equal(await p.locator("#review-state").inputValue(), "");
  await p.getByRole("button", { name: "评测与边界", exact: true }).click();
  assert.ok(await p.locator("#report").isVisible());
  assert.match(await p.locator("#report").innerText(), /不代表判断正确/);
  assert.match(await p.locator("#report").innerText(), /h05/);
  await p.getByRole("button", { name: "证据核验", exact: true }).click();
  await p.evaluate(() => (location.hash = "h05"));
  await p.waitForFunction(
    () => document.querySelector("#sample").value === "h05",
  );
  assert.match(await p.locator("#reason").innerText(), /分歧/);
  for (const width of [1440, 768, 390, 360]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    await p.locator("#jump-review").click();
    assert.ok(await p.locator("#review-state").isVisible());
  }
  await p.setViewportSize({ width: 390, height: 1000 });
  await p.screenshot({ path: out + "/mobile.png", fullPage: true });
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.screenshot({ path: out + "/desktop.png", fullPage: true });
  await p.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ "f05:999": { decision: "agree", note: "", at: "x" } }),
      ),
    "filing-review-" + dataset.version,
  );
  await p.reload();
  await ready();
  assert.match(await p.locator("#status").innerText(), /记录损坏/);
  const empty = await download();
  assert.equal(empty.reviews.length, 0);
  const blocked = await b.newContext();
  await blocked.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("disabled");
      },
    }),
  );
  const q = await blocked.newPage();
  q.on("pageerror", (e) => errors.push(e.message));
  await q.goto(url);
  await ready(q);
  await q.locator("#review-state").selectOption("agree");
  await q.locator("#review-form button").click();
  assert.match(await q.locator("#status").innerText(), /无法持久保存/);
  assert.match(await q.locator("#status").innerText(), /1\/7/);
  await blocked.close();
  const recovery = await b.newPage();
  let fail = true;
  await recovery.route("**/data.json", async (r) => {
    if (fail) {
      fail = false;
      await r.fulfill({ status: 503, body: "" });
    } else await r.continue();
  });
  await recovery.goto(url);
  await recovery.locator("#retry").waitFor();
  await recovery.locator("#retry").click();
  await ready(recovery);
  await recovery.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  console.log(
    `PASS: 28 cases / ${checked} claims / ${matched} located quotes, keyboard selection, explicit decisions, claim + omission reviews, provenance export, refresh/hash, empty filters, damaged/disabled storage, load retry, 4 widths; zero model calls or page errors.`,
  );
} finally {
  await b.close();
}
