// Фронт нового лица Vin-Car. Ходит только в НАШУ прослойку (/api/cars),
// токен наружу не идёт. Каталог с фильтрами + страница авто, роутинг по hash.
const view = document.getElementById("view");
let CARS = [];
let F = { make: "", model: "", fuel: "", trans: "", priceMax: "", yearFrom: "", sort: "new" };

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = (n) => "€ " + Number(n).toLocaleString("uk-UA");
const usd = (n) => "$ " + Number(n).toLocaleString("uk-UA");
const km = (n) => Number(n).toLocaleString("uk-UA") + " км";
const uniq = (a) => [...new Set(a.filter(Boolean))].sort();

async function boot() {
  try {
    const r = await fetch("/api/cars").then((x) => x.json());
    CARS = r.cars || [];
  } catch { CARS = []; }
  route();
}

function filtered() {
  let list = CARS.filter((c) =>
    (!F.make || c.make === F.make) &&
    (!F.model || c.model === F.model) &&
    (!F.fuel || c.fuel === F.fuel) &&
    (!F.trans || c.transmission === F.trans) &&
    (!F.priceMax || c.price_eur <= Number(F.priceMax)) &&
    (!F.yearFrom || c.year >= Number(F.yearFrom)));
  if (F.sort === "cheap") list = list.slice().sort((a, b) => a.price_eur - b.price_eur);
  else if (F.sort === "exp") list = list.slice().sort((a, b) => b.price_eur - a.price_eur);
  return list;
}

function opt(val, label, sel) { return `<option value="${esc(val)}" ${val === sel ? "selected" : ""}>${esc(label)}</option>`; }

function catalog() {
  const makes = uniq(CARS.map((c) => c.make));
  const models = uniq(CARS.filter((c) => !F.make || c.make === F.make).map((c) => c.model));
  const fuels = uniq(CARS.map((c) => c.fuel));
  const list = filtered();

  view.innerHTML = `
  <section class="hero"><div class="wrap">
    <h1>Авто з Європи</h1>
    <p>Аукціонні авто з прозорою історією та розмитненням. ${CARS.length} авто в наявності та в дорозі.</p>
    <div class="qbar">
      <select id="f-make"><option value="">Марка</option>${makes.map((m) => opt(m, m, F.make)).join("")}</select>
      <select id="f-model"><option value="">Модель</option>${models.map((m) => opt(m, m, F.model)).join("")}</select>
      <select id="f-fuel"><option value="">Паливо</option>${fuels.map((m) => opt(m, m, F.fuel)).join("")}</select>
      <select id="f-trans"><option value="">Коробка</option>${opt("Автомат", "Автомат", F.trans)}${opt("Ручна", "Ручна", F.trans)}</select>
      <input id="f-price" value="${esc(F.priceMax)}" placeholder="Ціна до, €" inputmode="numeric">
      <input id="f-year" value="${esc(F.yearFrom)}" placeholder="Рік від" inputmode="numeric">
      <button class="go" id="f-reset">Скинути</button>
    </div>
  </div></section>

  <main class="body">
    <div class="bar"><h2>Каталог</h2><span class="cnt">знайдено ${list.length} авто</span>
      <span class="sp"></span>
      <select id="f-sort">${opt("new", "Спочатку нові", F.sort)}${opt("cheap", "Дешевші спершу", F.sort)}${opt("exp", "Дорожчі спершу", F.sort)}</select>
    </div>
    <div class="grid">${list.length ? list.map(card).join("") : `<div class="empty">За фільтром авто не знайдено.</div>`}</div>
  </main>`;

  const bind = (id, key, ev = "change") => { const el = document.getElementById(id); if (el) el.addEventListener(ev, () => { F[key] = el.value; if (key === "make") F.model = ""; catalog(); }); };
  bind("f-make", "make"); bind("f-model", "model"); bind("f-fuel", "fuel"); bind("f-trans", "trans"); bind("f-sort", "sort");
  bind("f-price", "priceMax", "input"); bind("f-year", "yearFrom", "input");
  document.getElementById("f-reset").addEventListener("click", () => { F = { make: "", model: "", fuel: "", trans: "", priceMax: "", yearFrom: "", sort: "new" }; catalog(); });
}

function card(c) {
  return `<a class="card" href="#/car/${c.id}">
    <div class="ph">
      ${c.image ? `<img src="${esc(c.image)}" loading="lazy" alt="${esc(c.make)} ${esc(c.model)}">` : ""}
      <span class="ph-badge">📷 фото</span>
      ${c.location ? `<span class="ph-loc">${esc(c.location)}</span>` : ""}
    </div>
    <div class="info">
      <h3>${esc(c.make)} ${esc(c.model)}</h3>
      <div class="year">${c.year}</div>
      <div class="chips">
        <span>${km(c.mileage)}</span>
        <span>${esc(c.transmission || "—")}</span>
        <span>${esc(c.fuel || "—")}</span>
        <span class="plate">${esc(c.plate)}</span>
      </div>
    </div>
    <div class="price">
      <div class="p-eur">${eur(c.price_eur)}</div>
      <div class="p-usd">${usd(c.price_usd)}</div>
      <div class="p-note">з розмитненням</div>
      <span class="p-cta">Детальніше</span>
    </div>
  </a>`;
}

async function detail(id) {
  view.innerHTML = `<main class="body"><div class="empty">Завантаження…</div></main>`;
  let c;
  try { c = (await fetch("/api/cars/" + id).then((x) => x.json())).car; } catch { c = null; }
  if (!c) { view.innerHTML = `<main class="body"><div class="empty">Авто не знайдено. <a href="#" style="color:var(--navy);font-weight:700">До каталогу</a></div></main>`; return; }

  const specs = [
    ["Рік випуску", c.year],
    ["Пробіг", km(c.mileage)],
    ["Коробка", c.transmission || "—"],
    ["Паливо", c.fuel || "—"],
    ["Двигун", `${c.volume || "—"} л · ${c.power || "—"} к.с.`],
    ["Локація", c.location || "—"],
    ["Держномер", c.plate || "—"],
    ["Розмитнення", "включено в ціну"],
  ];
  const imgs = c.images || [];

  view.innerHTML = `<main class="body">
    <div class="crumb" onclick="location.hash=''">← Каталог · ${esc(c.make)} ${esc(c.model)}</div>
    <div class="dhead"><h1>${esc(c.make)} ${esc(c.model)}</h1><span class="yr">${c.year}</span>
      ${c.location ? `<span class="loc">${esc(c.location)}</span>` : ""}</div>
    <div class="cols">
      <div>
        <div class="gal">
          <div class="main"><img id="mainimg" src="${esc(imgs[0] || "")}" alt=""></div>
          <div class="thumbs">${imgs.slice(0, 12).map((u, i) => `<img class="${i === 0 ? "on" : ""}" src="${esc(u)}" data-u="${esc(u)}">`).join("")}</div>
        </div>
        <div class="dcard"><h2>Характеристики</h2>
          <div class="spec">${specs.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
        </div>
        <div class="dcard"><h2>Переваги</h2>
          <div class="trust">
            <span class="b">✔ Розмитнення включено</span>
            <span class="b">✔ Підтверджений пробіг</span>
            <span class="b">✔ Авто з аукціонів Європи</span>
          </div>
        </div>
      </div>
      <aside class="aside"><div class="buy">
        <div class="eur">${eur(c.price_eur)}</div>
        <div class="usd">${usd(c.price_usd)}</div>
        <div class="note">Ціна з розмитненням</div>
        <a class="cta">Залишити заявку</a>
        <a class="call" href="tel:+380673016400">Зателефонувати</a>
      </div></aside>
    </div>
  </main>`;

  const main = document.getElementById("mainimg");
  document.querySelectorAll(".thumbs img").forEach((t) => t.addEventListener("click", () => {
    main.src = t.dataset.u;
    document.querySelectorAll(".thumbs img").forEach((x) => x.classList.remove("on"));
    t.classList.add("on");
  }));
  window.scrollTo(0, 0);
}

function route() {
  const m = location.hash.match(/^#\/car\/(\d+)/);
  if (m) detail(m[1]); else catalog();
}
window.addEventListener("hashchange", route);
boot();
