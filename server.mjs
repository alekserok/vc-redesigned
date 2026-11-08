// Новое «лицо» каталога Vin-Car. Читает их API server-side (токен НЕ уходит в браузер),
// кэширует список машин и раздаёт фронту чистый JSON без токена. Их сайт не трогаем.
// Зависимостей нет — только Node built-ins (как my-portal).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { join, extname, normalize } from "node:path";

try { process.loadEnvFile(new URL("./.env", import.meta.url)); } catch {}

const PORT = Number(process.env.PORT || 8810);
const BASE = process.env.VINCAR_BASE || "https://vin-car.com/api/v1";
const TOKEN = process.env.VINCAR_TOKEN || "";
const PUBLIC = new URL("./public/", import.meta.url).pathname;

// ── Справочники кодов (из их API _filters) ─────────────────────────────────
const FUEL = { 1: "Дизель", 2: "Бензин", 3: "Газ", 4: "Гібрид", 8: "Гібрид PHEV", 9: "Гібрид MHEV", 5: "Електро", 6: "Бензин/Газ", 7: "Інше" };
const TRANS = { 0: "Ручна", 1: "Автомат" };
const LOC = { 1: "FR", 2: "Medyka", 3: "UA", 4: "BCA", 5: "В дорозі", 6: "Інша", 7: "Milejow", 8: "Alphabet", 9: "LeesPlan", 10: "Auto-1", 11: "VP", 12: "Athlon", 13: "ATC", 14: "ALD", 15: "Arval", 16: "Inter", 17: "Львів", 18: "Київ", 19: "Вінниця", 20: "Дніпро", 21: "Луцьк", 22: "Katowice", 23: "OPENLANE", 24: "Підготовка" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(Number(n) || 0);

async function apiGet(path) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        redirect: "follow",
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-rate-limit-reset")) || 2 * (attempt + 1);
        await sleep((reset + 1) * 1000);
        continue;
      }
      if (res.status === 404) { const e = new Error("not_found"); e.status = 404; throw e; }
      if (!res.ok) throw new Error(`API ${res.status}`);
      return { data: await res.json(), remaining: Number(res.headers.get("x-rate-limit-remaining")), reset: Number(res.headers.get("x-rate-limit-reset")) };
    } catch (e) {
      if (e.status === 404 || attempt >= 2) throw e; // сетевые сбои: 3 попытки, чтобы гость не ждал полминуты
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error("API не ответил");
}

// Публичная карточка списка — только то, что можно показывать гостю.
const mapCar = (c) => ({
  id: Number(c.id),
  make: c.name,
  model: c.model,
  year: c.production_year,
  price_eur: round(c.selling_price),
  price_usd: round(Number(c.selling_price) * 1.16),
  mileage: round(c.mileage),
  fuel: FUEL[c.fuel] || null,
  transmission: TRANS[c.transmission] ?? null,
  location: LOC[c.location] || null,
  location_code: c.location,
  plate: c.registration_number || "",
  image: c.image || null,
});

// Публичная детальная — БЕЗ paintwork (перефарбовки только для залогированных на их сайте).
const mapDetail = (c) => ({
  ...mapCar(c),
  volume: c.volume,
  power: c.power,
  description: c.description || "",
  images: (c.images || []).slice().sort((a, b) => a.sort - b.sort).map((i) => i.urlAlias),
});

// ── Кэш списка (чтоб не бить их API на каждого посетителя и не жечь лимит) ──
let cache = { at: 0, cars: [] };
const detailCache = new Map();
const TTL = 10 * 60 * 1000; // 10 минут
const missing = new Map(); // id → время ответа 404, чтобы перебор id не тратил их лимит
const MISS_TTL = 60 * 1000;

let inflight = null; // одновременные посетители ждут один и тот же запрос к API

async function getCars() {
  if (Date.now() - cache.at < TTL && cache.cars.length) return cache.cars;
  if (!inflight) inflight = fetchCars().finally(() => { inflight = null; });
  if (cache.cars.length) { // посетитель не ждёт: отдаём прежний список, новый подтянется в фоне
    inflight.catch((e) => console.error("API недоступен, отдаю кэш:", e.message));
    return cache.cars;
  }
  return inflight;
}

async function fetchCars() {
  const cars = [];
  let page = 1;
  while (page <= 50) {
    const { data, remaining, reset } = await apiGet(`/autos?per-page=30&page=${page}`);
    for (const it of data.items || []) if (Number.isSafeInteger(Number(it.id)) && Number(it.id) > 0) cars.push(mapCar(it));
    if (!data?._links?.next?.href) break;
    page++;
    if (Number.isFinite(remaining) && remaining <= 1) await sleep(((reset || 2) + 1) * 1000);
    else await sleep(250);
  }
  cache = { at: Date.now(), cars };
  return cars;
}

async function getDetail(id) {
  const hit = detailCache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.car;
  const miss = missing.get(id);
  if (miss && Date.now() - miss < MISS_TTL) { const e = new Error("not_found"); e.status = 404; throw e; }
  let data;
  try { ({ data } = await apiGet(`/autos/${encodeURIComponent(id)}`)); }
  catch (e) {
    if (e.status === 404) { if (missing.size > 2000) missing.clear(); missing.set(id, Date.now()); }
    if (hit && e.status !== 404) return hit.car;
    throw e;
  }
  const car = mapDetail(data);
  if (!Number.isSafeInteger(car.id) || car.id <= 0) { const e = new Error("bad_id"); e.status = 404; throw e; }
  if (detailCache.size > 500) detailCache.delete(detailCache.keys().next().value);
  detailCache.set(id, { at: Date.now(), car });
  return car;
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    if (path === "/api/cars") return json(res, 200, { cars: await getCars() });
    const m = path.match(/^\/api\/cars\/(\d+)$/);
    if (m) return json(res, 200, { car: await getDetail(m[1]) });
    if (path.startsWith("/api/")) return json(res, 404, { error: "not_found" });

    // статика
    const rel = path === "/" ? "/index.html" : path;
    const file = join(PUBLIC, normalize(rel).replace(/^(\.\.[/\\])+/, ""));
    const isFile = (() => { try { return statSync(file).isFile(); } catch { return false; } })();
    if (file.startsWith(PUBLIC) && isFile) {
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      return res.end(await readFile(file));
    }
    // SPA fallback
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    return res.end(await readFile(join(PUBLIC, "index.html")));
  } catch (e) {
    if (e.status === 404) return json(res, 404, { error: "not_found" });
    console.error(path, e.message);
    // наружу не отдаём текст ошибки их API — только общий статус
    return json(res, 502, { error: "upstream_unavailable" });
  }
});

if (!TOKEN) console.warn("VINCAR_TOKEN не задан — каталог не загрузится (см. .env.example)");
server.listen(PORT, () => console.log(`vincar-site на http://localhost:${server.address().port}`));
