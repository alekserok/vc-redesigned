// Проверка прослойки на подставном API (без настоящего токена и без сети).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const AUTOS = [
  { id: 1, name: "Renault", model: "Megane", production_year: 2021, selling_price: "15200", mileage: 184059, fuel: 1, transmission: 1, location: 2, registration_number: "GA683EB", image: "https://img/1.jpg", paintwork: "SECRET-PAINT", volume: "1.5", power: "115", description: "Опис", images: [{ sort: 2, urlAlias: "b.jpg" }, { sort: 1, urlAlias: "a.jpg" }] },
  { id: '1" onmouseover="alert(1)', name: "Evil", model: "X", production_year: 2020, selling_price: "1", mileage: 1, fuel: 1, transmission: 1, location: 1, registration_number: "", image: null },
  { id: 2, name: "Peugeot", model: "308", production_year: 2019, selling_price: "0", mileage: 1, fuel: 2, transmission: 0, location: 19, registration_number: "", image: null, paintwork: "SECRET-PAINT" },
];
let upstreamDown = false, calls = 0, seenAuth = "";
const mock = createServer((req, res) => {
  calls++; seenAuth = req.headers.authorization || "";
  if (upstreamDown) { res.writeHead(500); return res.end("boom internal detail"); }
  const u = new URL(req.url, "http://x");
  const one = u.pathname.match(/^\/autos\/(\d+)$/);
  res.setHeader("Content-Type", "application/json");
  if (one) {
    const a = AUTOS.find((x) => x.id === Number(one[1]));
    if (!a) { res.writeHead(404); return res.end("{}"); }
    return res.end(JSON.stringify(a));
  }
  return res.end(JSON.stringify({ items: AUTOS, _links: {} }));
});

let srv, base;
before(async () => {
  await new Promise((r) => mock.listen(0, r));
  srv = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, PORT: "0", VINCAR_BASE: `http://127.0.0.1:${mock.address().port}`, VINCAR_TOKEN: "test-token" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  base = await new Promise((resolve, reject) => {
    srv.stdout.on("data", (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve(`http://127.0.0.1:${m[1]}`); });
    srv.on("exit", (c) => reject(new Error("server exited " + c)));
  });
});
after(() => { srv?.kill(); mock.close(); });

test("список: публичные поля, без paintwork, токен только к API", async () => {
  const r = await fetch(base + "/api/cars");
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(!body.includes("SECRET-PAINT"), "paintwork не должен уходить гостю");
  assert.ok(!body.includes("test-token"));
  const { cars } = JSON.parse(body);
  assert.equal(cars.length, 2, "авто с некорректным id отбрасывается");
  assert.ok(!body.includes("onmouseover"));
  assert.deepEqual([cars[0].make, cars[0].fuel, cars[0].transmission, cars[0].location, cars[0].price_eur, cars[0].price_usd], ["Renault", "Дизель", "Автомат", "Medyka", 15200, 17632]);
  assert.equal(cars[1].transmission, "Ручна");
  assert.equal(seenAuth, "Bearer test-token");
});

test("карточка: фото по порядку sort, без paintwork", async () => {
  const r = await fetch(base + "/api/cars/1");
  const body = await r.text();
  assert.equal(r.status, 200);
  assert.ok(!body.includes("SECRET-PAINT"));
  const { car } = JSON.parse(body);
  assert.deepEqual(car.images, ["a.jpg", "b.jpg"]);
  assert.equal(car.description, "Опис");
});

test("несуществующее авто → 404, неизвестный /api → 404", async () => {
  assert.equal((await fetch(base + "/api/cars/999")).status, 404);
  assert.equal((await fetch(base + "/api/nope")).status, 404);
});

test("кэш: повторный список не ходит в API; при падении API отдаётся кэш", async () => {
  const before = calls;
  await fetch(base + "/api/cars");
  assert.equal(calls, before, "второй запрос должен идти из кэша");
  upstreamDown = true;
  const r = await fetch(base + "/api/cars/1");
  assert.equal(r.status, 200, "карточка из кэша при упавшем API");
  upstreamDown = false;
});

test("404 кэшируется: повторный запрос не идёт в API", async () => {
  await fetch(base + "/api/cars/777");
  const n = calls;
  assert.equal((await fetch(base + "/api/cars/777")).status, 404);
  assert.equal(calls, n);
});

test("ошибка API не раскрывает внутренний текст", async () => {
  upstreamDown = true;
  const r = await fetch(base + "/api/cars/2");
  upstreamDown = false;
  assert.equal(r.status, 502);
  const body = await r.text();
  assert.ok(!body.includes("boom"));
}, { timeout: 60000 });

test("статика и SPA-fallback, без выхода за public/", async () => {
  const idx = await fetch(base + "/");
  assert.equal(idx.status, 200);
  assert.match(await idx.text(), /<div id="view">/);
  const css = await fetch(base + "/styles.css");
  assert.match(css.headers.get("content-type"), /text\/css/);
  const trav = await fetch(base + "/..%2f..%2fserver.mjs");
  assert.ok(!(await trav.text()).includes("VINCAR_TOKEN"));
});

test("заголовки безопасности на HTML, статике, API и ошибках", async () => {
  for (const p of ["/", "/styles.css", "/api/cars", "/api/nope"]) {
    const r = await fetch(base + p);
    await r.arrayBuffer();
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", p);
    assert.equal(r.headers.get("x-frame-options"), "DENY", p);
    assert.match(r.headers.get("content-security-policy") || "", /frame-ancestors 'none'/, p);
    assert.match(r.headers.get("content-security-policy") || "", /script-src 'self'/, p);
    assert.ok(r.headers.get("referrer-policy"), p);
  }
});
