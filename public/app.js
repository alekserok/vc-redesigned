// Фронт нового лица Vin-Car. Ходит только в НАШУ прослойку (/api/cars),
// токен наружу не идёт. Каталог с фильтрами, страница авто, страницы
// «Доставка / Про нас / Контакти», роутинг по hash.
const view = document.getElementById("view");
const modal = document.getElementById("modal");
const PHONE = "+380673016400";
const PHONE_TEXT = "+380 67 30 16 400";
const PAGE = 20;

let CARS = [];
let LOAD_ERROR = false;
let shown = PAGE;
const EMPTY_F = { make: "", model: "", fuel: "", trans: "", priceMax: "", yearFrom: "", sort: "new" };
let F = { ...EMPTY_F };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (n) => "€ " + Number(n).toLocaleString("uk-UA");
const usd = (n) => "$ " + Number(n).toLocaleString("uk-UA");
const km = (n) => Number(n).toLocaleString("uk-UA") + " км";
const uniq = (a) => [...new Set(a.filter(Boolean))].sort();
const num = (s) => Number(String(s).replace(/\D/g, "")) || 0;

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
  return r.json();
}

async function loadCars() {
  try { CARS = (await getJSON("/api/cars")).cars || []; LOAD_ERROR = false; }
  catch { CARS = []; LOAD_ERROR = true; }
}

function errorBox(text) {
  return `<div class="empty err">${esc(text)}<br><button class="retry" type="button" data-retry>Спробувати ще раз</button>
    <div class="err-call">або зателефонуйте: <a href="tel:${PHONE}">${PHONE_TEXT}</a></div></div>`;
}

function filtered() {
  const priceMax = num(F.priceMax), yearFrom = num(F.yearFrom);
  let list = CARS.filter((c) =>
    (!F.make || c.make === F.make) &&
    (!F.model || c.model === F.model) &&
    (!F.fuel || c.fuel === F.fuel) &&
    (!F.trans || c.transmission === F.trans) &&
    (!priceMax || (c.price_eur > 0 && c.price_eur <= priceMax)) &&
    (!yearFrom || c.year >= yearFrom));
  if (F.sort === "cheap") list = list.slice().sort((a, b) => (a.price_eur || Infinity) - (b.price_eur || Infinity));
  else if (F.sort === "exp") list = list.slice().sort((a, b) => b.price_eur - a.price_eur);
  return list;
}

function opt(val, label, sel) { return `<option value="${esc(val)}" ${val === sel ? "selected" : ""}>${esc(label)}</option>`; }

function priceBlock(c, cls) {
  if (!c.price_eur) return `<div class="${cls.eur}">Ціна за запитом</div>`;
  return `<div class="${cls.eur}">${eur(c.price_eur)}</div><div class="${cls.usd}">${usd(c.price_usd)}</div>`;
}

function catalog() {
  const makes = uniq(CARS.map((c) => c.make));
  const models = uniq(CARS.filter((c) => !F.make || c.make === F.make).map((c) => c.model));
  const fuels = uniq(CARS.map((c) => c.fuel));
  const sub = LOAD_ERROR ? "Аукціонні авто з прозорою історією та розмитненням."
    : `Аукціонні авто з прозорою історією та розмитненням. ${CARS.length} авто в наявності та в дорозі.`;

  view.innerHTML = `
  <section class="hero"><div class="wrap">
    <h1>Авто з Європи</h1>
    <p>${sub}</p>
    <div class="qbar">
      <select id="f-make" aria-label="Марка"><option value="">Марка</option>${makes.map((m) => opt(m, m, F.make)).join("")}</select>
      <select id="f-model" aria-label="Модель"><option value="">Модель</option>${models.map((m) => opt(m, m, F.model)).join("")}</select>
      <select id="f-fuel" aria-label="Паливо"><option value="">Паливо</option>${fuels.map((m) => opt(m, m, F.fuel)).join("")}</select>
      <select id="f-trans" aria-label="Коробка"><option value="">Коробка</option>${opt("Автомат", "Автомат", F.trans)}${opt("Ручна", "Ручна", F.trans)}</select>
      <input id="f-price" value="${esc(F.priceMax)}" placeholder="Ціна до, €" inputmode="numeric" aria-label="Ціна до, €">
      <input id="f-year" value="${esc(F.yearFrom)}" placeholder="Рік від" inputmode="numeric" aria-label="Рік від">
      <button class="go" id="f-reset" type="button">Скинути</button>
    </div>
  </div></section>

  <main class="body">
    <div class="bar"><h2>Каталог</h2><span class="cnt" id="cnt"></span>
      <span class="sp"></span>
      <select id="f-sort" aria-label="Сортування">${opt("new", "Спочатку нові", F.sort)}${opt("cheap", "Дешевші спершу", F.sort)}${opt("exp", "Дорожчі спершу", F.sort)}</select>
    </div>
    <div class="grid" id="grid"></div>
  </main>`;

  // select-фильтры меняют список моделей → полный перерендер;
  // текстовые поля перерисовывают только список, чтобы не терять фокус при наборе.
  const bindSel = (id, key) => document.getElementById(id).addEventListener("change", (e) => {
    F[key] = e.target.value; if (key === "make") F.model = ""; shown = PAGE; catalog();
  });
  const bindInput = (id, key) => document.getElementById(id).addEventListener("input", (e) => {
    F[key] = e.target.value; shown = PAGE; renderList();
  });
  bindSel("f-make", "make"); bindSel("f-model", "model"); bindSel("f-fuel", "fuel"); bindSel("f-trans", "trans");
  document.getElementById("f-sort").addEventListener("change", (e) => { F.sort = e.target.value; shown = PAGE; renderList(); });
  bindInput("f-price", "priceMax"); bindInput("f-year", "yearFrom");
  document.getElementById("f-reset").addEventListener("click", () => { F = { ...EMPTY_F }; shown = PAGE; catalog(); });
  renderList();
}

function renderList() {
  const grid = document.getElementById("grid");
  const cnt = document.getElementById("cnt");
  if (!grid) return;
  if (LOAD_ERROR) {
    cnt.textContent = "";
    grid.innerHTML = errorBox("Не вдалося завантажити каталог.");
    return;
  }
  const list = filtered();
  cnt.textContent = `знайдено ${list.length} авто`;
  if (!list.length) {
    grid.innerHTML = CARS.length
      ? `<div class="empty">За фільтром авто не знайдено. <button class="linkbtn" type="button" data-reset>Скинути фільтри</button></div>`
      : `<div class="empty">Зараз авто в каталозі немає. Зателефонуйте: <a href="tel:${PHONE}">${PHONE_TEXT}</a></div>`;
    return;
  }
  grid.innerHTML = list.slice(0, shown).map(card).join("") +
    (list.length > shown ? `<button class="more" type="button" data-more>Показати ще ${Math.min(PAGE, list.length - shown)} з ${list.length - shown}</button>` : "");
}

function card(c) {
  return `<a class="card" href="#/car/${c.id}">
    <div class="ph">
      ${c.image ? `<img src="${esc(c.image)}" loading="lazy" alt="${esc(c.make)} ${esc(c.model)}">` : `<span class="ph-none">Фото готуються</span>`}
      <span class="ph-badge">📷 фото</span>
      ${c.location ? `<span class="ph-loc">${esc(c.location)}</span>` : ""}
    </div>
    <div class="info">
      <h3>${esc(c.make)} ${esc(c.model)}</h3>
      <div class="year">${esc(c.year)}</div>
      <div class="chips">
        <span>${km(c.mileage)}</span>
        <span>${esc(c.transmission || "—")}</span>
        <span>${esc(c.fuel || "—")}</span>
        ${c.plate ? `<span class="plate">${esc(c.plate)}</span>` : ""}
      </div>
    </div>
    <div class="price">
      ${priceBlock(c, { eur: "p-eur", usd: "p-usd" })}
      <div class="p-note">з розмитненням</div>
      <span class="p-cta">Детальніше</span>
    </div>
  </a>`;
}

let galIdx = 0;
async function detail(id) {
  view.innerHTML = `<main class="body"><div class="empty">Завантаження…</div></main>`;
  let c = null, failed = false;
  try { c = (await getJSON("/api/cars/" + id)).car; }
  catch (e) { failed = e.status !== 404; }
  if (location.hash !== "#/car/" + id) return; // пользователь уже ушёл на другую страницу
  if (!c) {
    view.innerHTML = `<main class="body">${failed ? errorBox("Не вдалося завантажити авто.")
      : `<div class="empty">Авто не знайдено або вже продане. <a class="linkbtn" href="#/">До каталогу</a></div>`}</main>`;
    return;
  }

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
  galIdx = 0;
  const title = `${c.make} ${c.model}`;
  document.title = `${title} ${c.year} — Vin-Car`;

  view.innerHTML = `<main class="body">
    <a class="crumb" href="#/">← Каталог · ${esc(title)}</a>
    <div class="dhead"><h1>${esc(title)}</h1><span class="yr">${esc(c.year)}</span>
      ${c.location ? `<span class="loc">${esc(c.location)}</span>` : ""}</div>
    <div class="cols">
      <div>
        <div class="gal">
          ${imgs.length ? `<div class="main">
            <img id="mainimg" src="${esc(imgs[0])}" alt="${esc(title)}, фото 1">
            ${imgs.length > 1 ? `<button class="nav prev" type="button" data-step="-1" aria-label="Попереднє фото">‹</button>
            <button class="nav next" type="button" data-step="1" aria-label="Наступне фото">›</button>
            <span class="count" id="galcount">1 / ${imgs.length}</span>` : ""}
          </div>
          <div class="thumbs">${imgs.slice(0, 12).map((u, i) => `<img class="${i === 0 ? "on" : ""}" src="${esc(u)}" data-i="${i}" loading="lazy" alt="${esc(title)}, фото ${i + 1}">`).join("")}</div>`
          : `<div class="main nophoto">Фото готуються</div>`}
        </div>
        <div class="dcard"><h2>Характеристики</h2>
          <div class="spec">${specs.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
        </div>
        ${c.description ? `<div class="dcard"><h2>Опис</h2><div class="desc">${esc(c.description)}</div></div>` : ""}
        <div class="dcard"><h2>Переваги</h2>
          <div class="trust">
            <span class="b">✔ Розмитнення включено</span>
            <span class="b">✔ Підтверджений пробіг</span>
            <span class="b">✔ Авто з аукціонів Європи</span>
          </div>
        </div>
      </div>
      <aside class="aside"><div class="buy">
        ${priceBlock(c, { eur: "eur", usd: "usd" })}
        <div class="note">Ціна з розмитненням</div>
        <button class="cta" type="button" data-lead>Залишити заявку</button>
        <a class="call" href="tel:${PHONE}">Зателефонувати</a>
      </div></aside>
    </div>
  </main>`;

  const main = document.getElementById("mainimg");
  const show = (i) => {
    if (!main) return;
    galIdx = (i + imgs.length) % imgs.length;
    main.src = imgs[galIdx];
    main.alt = `${title}, фото ${galIdx + 1}`;
    document.querySelectorAll(".thumbs img").forEach((x, k) => x.classList.toggle("on", k === galIdx));
    const cnt = document.getElementById("galcount");
    if (cnt) cnt.textContent = `${galIdx + 1} / ${imgs.length}`;
  };
  document.querySelectorAll(".thumbs img").forEach((t) => t.addEventListener("click", () => show(Number(t.dataset.i))));
  document.querySelectorAll(".gal .nav").forEach((b) => b.addEventListener("click", () => show(galIdx + Number(b.dataset.step))));
  detail.show = imgs.length > 1 ? show : null;
  detail.car = c;
  window.scrollTo(0, 0);
}

// ── Заявка: своего сервера заявок у Vin-Car нет, поэтому заявка = звонок или Viber
//    с готовым текстом про конкретное авто. Ничего никуда не отправляем сами.
function openLead(c) {
  const what = `${c.make} ${c.model} ${c.year}${c.plate ? ", " + c.plate : ""}`;
  const text = `Добрий день! Цікавить авто ${what} (${location.href})`;
  modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="lead-h">
    <button class="x" type="button" data-close aria-label="Закрити">×</button>
    <h2 id="lead-h">Заявка на авто</h2>
    <p class="lead-car">${esc(what)}</p>
    <p class="lead-hint">Зателефонуйте або напишіть у Viber — менеджер підкаже щодо огляду, доставки й оформлення.</p>
    <a class="cta" href="tel:${PHONE}">Зателефонувати ${PHONE_TEXT}</a>
    <a class="call" href="viber://chat?number=%2B${PHONE.slice(1)}&draft=${encodeURIComponent(text)}">Написати у Viber</a>
    <button class="copy" type="button" data-copy="${esc(text)}">Скопіювати текст заявки</button>
  </div>`;
  modal.hidden = false;
  document.body.classList.add("noscroll");
  modal.querySelector("[data-close]").focus();
}
function closeLead() { modal.hidden = true; modal.innerHTML = ""; document.body.classList.remove("noscroll"); }

// ── Информационные страницы ──
function page(kind) {
  const loc = uniq(CARS.map((c) => c.location));
  const pages = {
    delivery: ["Доставка", `
      <p>Усі авто в каталозі куплені на аукціонах Європи. Ціна на сайті вже включає розмитнення.</p>
      <p>На картці кожного авто видно, де воно зараз${loc.length ? ` (${esc(loc.join(", "))})` : ""}: ще в Європі, в дорозі чи вже в Україні.</p>
      <p>Термін і вартість доставки до вашого міста уточнюйте в менеджера.</p>`],
    about: ["Про нас", `
      <p>Vin-Car — авто з аукціонів Європи з прозорою історією.</p>
      <div class="trust"><span class="b">✔ Розмитнення включено</span><span class="b">✔ Підтверджений пробіг</span><span class="b">✔ Авто з аукціонів Європи</span></div>
      <p><a class="linkbtn" href="#/">Перейти до каталогу${CARS.length ? ` (${CARS.length} авто)` : ""}</a></p>`],
    contacts: ["Контакти", `
      <div class="contact">
        <div><span>Телефон</span><a href="tel:${PHONE}">${PHONE_TEXT}</a></div>
        <div><span>Менеджер</span><b>Владислав</b></div>
        <div><span>Місто</span><b>Вінниця</b></div>
        <div><span>Viber</span><a href="viber://chat?number=%2B${PHONE.slice(1)}">Написати у Viber</a></div>
      </div>`],
  };
  const [h, body] = pages[kind];
  document.title = `${h} — Vin-Car`;
  view.innerHTML = `<main class="body"><a class="crumb" href="#/">← Каталог</a><div class="dcard page"><h1>${h}</h1>${body}</div></main>`;
  window.scrollTo(0, 0);
}

function setNav(key) {
  document.querySelectorAll("#mainnav a").forEach((a) => a.classList.toggle("on", a.dataset.nav === key));
  document.getElementById("burger").setAttribute("aria-expanded", "false");
  document.querySelector(".top").classList.remove("open");
}

function route() {
  closeLead();
  const h = location.hash;
  const m = h.match(/^#\/car\/(\d+)/);
  const p = h.match(/^#\/(delivery|about|contacts)$/);
  detail.show = null;
  if (m) { setNav(""); return detail(m[1]); }
  if (p) { setNav(p[1]); return page(p[1]); }
  setNav("");
  document.title = "Vin-Car — авто з Європи";
  catalog();
}

// ── Делегирование кликов ──
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-more],[data-reset],[data-retry],[data-lead],[data-close],[data-copy],#burger");
  if (!t) { if (e.target === modal) closeLead(); return; }
  if (t.id === "burger") {
    const top = document.querySelector(".top");
    const open = !top.classList.contains("open");
    top.classList.toggle("open", open);
    t.setAttribute("aria-expanded", String(open));
  } else if (t.hasAttribute("data-more")) { shown += PAGE; renderList(); }
  else if (t.hasAttribute("data-reset")) { F = { ...EMPTY_F }; shown = PAGE; catalog(); }
  else if (t.hasAttribute("data-retry")) { view.innerHTML = `<div class="empty">Завантаження…</div>`; await loadCars(); route(); }
  else if (t.hasAttribute("data-lead") && detail.car) openLead(detail.car);
  else if (t.hasAttribute("data-close")) closeLead();
  else if (t.hasAttribute("data-copy")) {
    try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = "Скопійовано ✓"; }
    catch { t.textContent = "Не вдалося скопіювати"; }
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) return closeLead();
  if (!modal.hidden || !detail.show || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "")) return;
  if (e.key === "ArrowLeft") detail.show(galIdx - 1);
  if (e.key === "ArrowRight") detail.show(galIdx + 1);
});

window.addEventListener("hashchange", route);
(async () => { view.innerHTML = `<div class="empty">Завантаження…</div>`; await loadCars(); route(); })();
