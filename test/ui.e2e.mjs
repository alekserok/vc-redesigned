// Браузерная проверка интерфейса (компьютер + телефон) на подставном API.
// Запуск: npm run test:ui   (нужен Playwright: npm i -D playwright && npx playwright install chromium)
// В обычный `npm test` не входит, чтобы проект оставался без зависимостей.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.log("SKIP: playwright не встановлено (npm i -D playwright)"); process.exit(0); }

const img = (i) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#${(i * 1234567 % 0xffffff).toString(16).padStart(6, "0")}"/></svg>`)}`;
const AUTOS = Array.from({ length: 45 }, (_, i) => ({
  id: i + 1, name: i % 2 ? "Renault" : "Peugeot", model: i % 3 ? "Megane" : "<b>308</b>", production_year: 2015 + (i % 8),
  selling_price: String(i === 0 ? 0 : 8000 + i * 150), mileage: 100000 + i, fuel: 1 + (i % 2), transmission: i % 2,
  location: 2, registration_number: "AA" + i, image: img(i), paintwork: "SECRET", volume: "1.5", power: "110",
  description: i === 1 ? "Рядок 1\nРядок 2" : "", images: Array.from({ length: 20 }, (_, k) => ({ sort: k, urlAlias: img(i * 20 + k) })),
}));
const mock = createServer((req, res) => {
  const one = req.url.match(/^\/autos\/(\d+)/);
  res.setHeader("Content-Type", "application/json");
  if (one) { const a = AUTOS.find((x) => x.id == one[1]); if (!a) { res.writeHead(404); return res.end("{}"); } return res.end(JSON.stringify(a)); }
  res.end(JSON.stringify({ items: AUTOS, _links: {} }));
});
await new Promise((r) => mock.listen(0, r));
const srv = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: "0", VINCAR_BASE: `http://127.0.0.1:${mock.address().port}`, VINCAR_TOKEN: "t" }, stdio: ["ignore", "pipe", "inherit"] });
const base = await new Promise((r) => srv.stdout.on("data", (d) => { const m = String(d).match(/localhost:(\d+)/); if (m) r(`http://127.0.0.1:${m[1]}`); }));

const browser = await chromium.launch();
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("✔", name); } catch (e) { failed++; console.log("✖", name, "\n ", e.message); } };
try {
  for (const [label, vp] of [["компʼютер", { width: 1470, height: 900 }], ["телефон", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/"); await page.waitForSelector(".card");

    await check(`${label}: без прокрутки вбік`, async () => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    });
    await check(`${label}: XSS з даних API не виконується`, async () => {
      assert.equal(await page.locator(".card b").count(), 0);
      assert.ok((await page.textContent(".grid")).includes("<b>308</b>"));
    });
    await check(`${label}: «Показати ще» 20 → 40 → 45`, async () => {
      assert.equal(await page.locator(".card").count(), 20);
      await page.click("[data-more]"); assert.equal(await page.locator(".card").count(), 40);
      await page.click("[data-more]"); assert.equal(await page.locator(".card").count(), 45);
      assert.equal(await page.locator("[data-more]").count(), 0);
    });
    await check(`${label}: «Ціна за запитом» для ціни 0`, async () => {
      assert.ok((await page.textContent(".grid")).includes("Ціна за запитом"));
    });
    await check(`${label}: поле ціни не втрачає фокус`, async () => {
      await page.click("#f-price"); await page.keyboard.type("9000");
      assert.equal(await page.evaluate(() => document.activeElement.id), "f-price");
      assert.equal(await page.inputValue("#f-price"), "9000");
      await page.click("#f-reset");
    });
    if (vp.width < 900) await check(`${label}: бургер відкриває меню і переходить`, async () => {
      assert.equal(await page.isVisible("#mainnav"), false);
      await page.click("#burger"); assert.equal(await page.isVisible("#mainnav"), true);
      await page.click('#mainnav a[href="#/contacts"]'); await page.waitForSelector(".contact");
      assert.equal(await page.isVisible("#mainnav"), false);
    });
    else await check(`${label}: меню Доставка / Про нас / Контакти`, async () => {
      for (const [href, h] of [["#/delivery", "Доставка"], ["#/about", "Про нас"], ["#/contacts", "Контакти"]]) {
        await page.click(`#mainnav a[href="${href}"]`); await page.waitForFunction((t) => document.querySelector(".page h1")?.textContent === t, h, { timeout: 3000 });
      }
    });
    await check(`${label}: галерея — стрілки, лічильник, мініатюра після 12-ї`, async () => {
      await page.goto(base + "/#/car/2"); await page.waitForSelector("#mainimg");
      assert.ok((await page.textContent(".desc")).includes("Рядок 2"));
      await page.click(".gal .prev"); assert.equal(await page.textContent("#galcount"), "20 / 20");
      assert.equal(await page.getAttribute(".thumbs img.on", "data-i"), "19");
      await page.click(".gal .next"); assert.equal(await page.textContent("#galcount"), "1 / 20");
    });
    await check(`${label}: вікно заявки — відкрити, Esc, фокус повертається`, async () => {
      await page.click("[data-lead]"); assert.equal(await page.isVisible("#modal .sheet"), true);
      assert.ok((await page.textContent("#modal")).includes("Renault"));
      await page.keyboard.press("Escape"); assert.equal(await page.isVisible("#modal .sheet"), false);
      assert.equal(await page.evaluate(() => document.activeElement?.dataset?.lead !== undefined), true);
    });
    await check(`${label}: неіснуюче авто`, async () => {
      await page.goto(base + "/#/car/999"); await page.waitForSelector("text=Авто не знайдено");
    });
    await check(`${label}: без помилок JS`, async () => assert.deepEqual(errors, []));
    await page.close();
  }
} finally { await browser.close(); srv.kill(); mock.close(); }
if (failed) { console.log(`\n${failed} перевірок не пройшло`); process.exit(1); }
console.log("\nUI: усі перевірки пройдено");
