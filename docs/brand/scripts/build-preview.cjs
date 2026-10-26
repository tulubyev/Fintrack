/**
 * Собирает brand-preview.html: самодостаточная страница (SVG встроены, скриптов нет, шрифт — Google Fonts).
 * Цвета берутся из tokens.json, логотипы — из logos/ и app-icon/. Запуск из папки brand: node scripts/build-preview.cjs
 */
const fs = require("fs"), path = require("path");
const B = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(B, "tokens.json"), "utf8"));
const C = T.color;
const read = (p) => fs.readFileSync(path.join(B, p), "utf8").replace(/<title>.*?<\/title>/, "");
const svgImg = (p, h, alt = "") =>
  `<img src="data:image/svg+xml;base64,${Buffer.from(read(p)).toString("base64")}" alt="${alt}" style="height:${h}px;width:auto;display:block">`;

// ---- переменные тем ----
const vars = (theme) => Object.entries(theme).filter(([k]) => !k.startsWith("$")).map(([k, v]) => `--${k}:${v};`).join("");

// ---- иконки (контуры Lucide, ISC) ----
const ICONS = {
  in: '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
  out: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  transfer: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  tv: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  list: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  pie: '<path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M19 15.5v4"/><path d="M17 17.5h4"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
};
const ic = (name, size = 20, extra = "") =>
  `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// ---- иллюстрация пустого состояния: выписка ложится в «кладку» ----
const emptyIllustration = `
<svg width="160" height="112" viewBox="0 0 160 112" fill="none" aria-hidden="true">
  <rect x="14" y="10" width="54" height="70" rx="8" fill="var(--card)" stroke="var(--muted-foreground)" stroke-width="1.75"/>
  <path d="M26 26h30M26 36h22M26 46h30M26 56h16" stroke="var(--muted-foreground)" stroke-width="1.75" stroke-linecap="round"/>
  <path d="M76 45h18m0 0-6-6m6 6-6 6" stroke="var(--primary)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="104" y="30" width="44" height="10" rx="3.5" fill="var(--chart-1)" opacity=".55"/>
  <rect x="104" y="45" width="24" height="10" rx="3.5" fill="var(--primary)"/>
  <rect x="132" y="45" width="16" height="10" rx="3.5" fill="var(--primary)"/>
  <rect x="104" y="60" width="12" height="10" rx="3.5" fill="var(--primary)"/>
  <rect x="120" y="60" width="28" height="10" rx="3.5" fill="var(--primary)"/>
  <path d="M10 96h140" stroke="var(--border)" stroke-width="1.75" stroke-linecap="round"/>
</svg>`;

// ---- деньги ----
const MINUS = "−", NB = " ";
const money = (v, { signed = false, cls = "", split = false } = {}) => {
  const n = Number(v);
  const abs = Math.abs(n);
  const hasK = Math.round(abs * 100) % 100 !== 0;
  const s = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: hasK ? 2 : 0, maximumFractionDigits: 2 }).format(abs);
  const sign = n < 0 ? MINUS : signed && n > 0 ? "+" : "";
  if (split) {
    const [int, frac] = s.split(",");
    return `<span class="amount ${cls}">${sign}${int}<span class="kop">${frac ? "," + frac : ""}${NB}₽</span></span>`;
  }
  return `<span class="amount ${cls}">${sign}${s}${NB}₽</span>`;
};
const srMoney = (v) => {
  const n = Number(v);
  return `${n < 0 ? "Расход" : "Доход"}, ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Math.abs(n))} рубля`;
};

const txRow = ({ icon, title, sub, amount, kind }) => {
  const k = kind ?? (Number(amount) < 0 ? "expense" : "income");
  const dir = k === "income" ? ic("in", 14) : k === "transfer" ? ic("transfer", 14) : ic("out", 14);
  return `<div class="tx">
    <div class="tx-icon">${ic(icon, 18)}</div>
    <div class="tx-text"><div class="tx-title">${title}</div><div class="tx-sub">${sub}</div></div>
    <div class="tx-amt ${k}" aria-label="${k === "transfer" ? "Перевод между своими счетами" : srMoney(amount)}">
      <span class="dir">${dir}</span>${money(amount, { signed: k === "income" })}
    </div>
  </div>`;
};

const swatch = (hex, name, note = "") => {
  const L = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const cr = (a, b) => { const [x, y] = [L(a), L(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const onWhite = cr(hex, "#FFFFFF"), onInk = cr(hex, C.base.neutral.ink);
  const fg = onWhite >= onInk ? "#FFFFFF" : C.base.neutral.ink;
  return `<div class="sw" style="background:${hex};color:${fg}"><b>${name}</b><span>${hex}</span>${note ? `<span>${note}</span>` : ""}</div>`;
};
const scale = (obj, prefix) =>
  `<div class="scale">${Object.entries(obj).filter(([k]) => !k.startsWith("$") && !k.startsWith("fg")).map(([k, v]) => swatch(v, `${prefix} ${k}`)).join("")}</div>`;

const L = (p, h, alt) => svgImg(p, h, alt);

const concept = (key, name, idea, recommended) => `
<article class="concept${recommended ? " rec" : ""}">
  <header><h3>${name}</h3>${recommended ? '<span class="badge-rec">выбран</span>' : ""}</header>
  <div class="logo-pair">
    <div class="tile light">${L(`logos/${key}/logo-light.svg`, 40, `Логотип ${name}, светлый фон`)}
      <div class="sizes">${[64, 32, 24, 16].map((s) => `<div>${L(`logos/${key}/mark-light.svg`, s)}<small>${s}</small></div>`).join("")}</div></div>
    <div class="tile dark">${L(`logos/${key}/logo-dark.svg`, 40, `Логотип ${name}, тёмный фон`)}
      <div class="sizes">${[64, 32, 24, 16].map((s) => `<div>${L(`logos/${key}/mark-dark.svg`, s)}<small>${s}</small></div>`).join("")}</div></div>
  </div>
  <p>${idea}</p>
</article>`;

// адаптивная иконка: фон + передний план, маска разной формы
const adaptive = (shape, label) => {
  const bg = svgImg("app-icon/android/ic_launcher_background.svg", 0).replace("height:0px", "");
  const fg = svgImg("app-icon/android/ic_launcher_foreground.svg", 0).replace("height:0px", "");
  return `<figure class="ai"><div class="ai-mask ${shape}"><div class="ai-layer">${bg}</div><div class="ai-layer">${fg}</div></div><figcaption>${label}</figcaption></figure>`;
};

const panel = (theme, inner) => `<div class="panel theme-${theme}"><div class="panel-label">${theme === "light" ? "Светлая тема" : "Тёмная тема"}</div>${inner}</div>`;

const components = `
  <div class="card balance">
    <div class="row-between"><span class="overline">Всего на счетах</span>
      <span class="eye">${ic("eye", 18)}</span></div>
    <div class="hero">${money("247830.50", { split: true })}</div>
    <div class="delta"><span class="chip-neutral">${ic("out", 14)} Траты за октябрь ${money("-61240")}</span>
      <span class="muted">на 8% меньше, чем в сентябре</span></div>
    <div class="accounts">
      <div><span class="dot" style="background:var(--chart-1)"></span>Карта ··4821<b>${money("54210.50")}</b></div>
      <div><span class="dot" style="background:var(--chart-2)"></span>Накопительный<b>${money("180000")}</b></div>
      <div><span class="dot" style="background:var(--chart-3)"></span>Наличные<b>${money("13620")}</b></div>
    </div>
  </div>

  <div class="card list">
    <div class="list-head"><span class="overline">Сегодня</span><span class="muted">24 октября</span></div>
    ${txRow({ icon: "cart", title: "Продукты у дома", sub: "Продукты · Карта ··4821", amount: "-1234.50" })}
    ${txRow({ icon: "briefcase", title: "Зарплата", sub: "Доход · Карта ··4821", amount: "86500" })}
    ${txRow({ icon: "coffee", title: "Кофейня «Зерно»", sub: "Кафе · Карта ··4821", amount: "-320" })}
    ${txRow({ icon: "transfer", title: "На накопительный", sub: "Перевод между своими счетами", amount: "15000", kind: "transfer" })}
  </div>

  <div class="card">
    <div class="row-between"><b>Кафе и рестораны</b><span class="amount">${money("8400")} <span class="muted">из ${money("10000")}</span></span></div>
    <div class="track"><div class="fill warn" style="width:84%"></div><div class="marker" style="left:77%"></div></div>
    <div class="note warn-text">${ic("alert", 16)} Осталось ${money("1600")} на 7 дней — чуть быстрее обычного</div>
    <div class="row-between" style="margin-top:14px"><b>Продукты</b><span class="amount">${money("12100")} <span class="muted">из ${money("20000")}</span></span></div>
    <div class="track"><div class="fill ok" style="width:60%"></div><div class="marker" style="left:77%"></div></div>
  </div>

  <div class="card advisor">
    <div class="adv-head">${ic("spark", 18)}<span>Совет · по вашим данным</span></div>
    <p>Три подписки стоят вам <b>${money("2970")} в&nbsp;месяц</b>. Две из них вы не открывали с августа.</p>
    <div class="adv-actions"><button class="btn btn-advisor">Показать подписки</button><button class="btn btn-ghost">Не сейчас</button></div>
    <div class="adv-foot">Мы не получаем деньги от сервисов, которые советуем отменить или оставить.</div>
  </div>

  <div class="buttons">
    <button class="btn btn-primary">${ic("plus", 18)} Добавить операцию</button>
    <button class="btn btn-secondary">${ic("upload", 18)} Загрузить выписку</button>
    <button class="btn btn-ghost">Отмена</button>
    <button class="btn btn-danger">Удалить</button>
    <button class="btn btn-primary" disabled>Недоступно</button>
  </div>

  <div class="banners">
    <div class="banner b-error">${ic("alert", 18)}<div><b>Не удалось прочитать выписку</b><br>Файл похож на PDF из Т-Банка, но страницы 3–4 пустые. Скачайте выписку заново или загрузите CSV.</div></div>
    <div class="banner b-success"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><div><b>Импорт готов: 214 операций</b><br>12 повторов мы пропустили. Остаток сходится с банком.</div></div>
  </div>

  <div class="card empty">
    ${emptyIllustration}
    <b>Здесь появятся ваши траты</b>
    <span class="muted">Загрузите выписку из банка — за пару минут увидите, куда уходят деньги. Или добавьте первую операцию вручную.</span>
    <div class="adv-actions"><button class="btn btn-primary">Загрузить выписку</button><button class="btn btn-ghost">Добавить вручную</button></div>
  </div>
`;

const phone = (theme) => `
<div class="phone theme-${theme}">
  <div class="status"><span>9:41</span><span class="st-icons"><i></i><i></i><i class="bat"></i></span></div>
  <div class="ph-head">
    ${L(`logos/d-gran/mark-${theme}.svg`, 26, "")}
    <span class="ph-title">Главная</span>
    <span class="ph-bell">${ic("bell", 22)}</span>
  </div>
  <div class="ph-body">
    <div class="card balance compact">
      <span class="overline">Всего на счетах</span>
      <div class="hero">${money("247830.50", { split: true })}</div>
      <div class="delta"><span class="muted">Траты за октябрь</span> <span class="amount">${money("-61240")}</span></div>
      <div class="bar">${[["chart-1", 34], ["chart-2", 22], ["chart-3", 16], ["chart-4", 12], ["chart-5", 9], ["chart-8", 7]].map(([c, w]) => `<i style="width:${w}%;background:var(--${c})"></i>`).join("")}</div>
    </div>
    <div class="card advisor slim">
      <div class="adv-head">${ic("spark", 16)}<span>Совет</span></div>
      <p>Подписки — ${money("2970")}/мес. Две не открывали с августа.</p>
    </div>
    <div class="section-title">Последние операции</div>
    <div class="card list">
      ${txRow({ icon: "cart", title: "Продукты у дома", sub: "Сегодня, 18:20", amount: "-1234.50" })}
      ${txRow({ icon: "briefcase", title: "Зарплата", sub: "Сегодня, 10:02", amount: "86500" })}
      ${txRow({ icon: "tv", title: "Онлайн-кинотеатр", sub: "Вчера · подписка", amount: "-399" })}
      ${txRow({ icon: "coffee", title: "Кофейня «Зерно»", sub: "Вчера, 08:45", amount: "-320" })}
    </div>
  </div>
  <nav class="tabbar">
    <span class="active">${ic("home", 22)}<small>Главная</small></span>
    <span>${ic("list", 22)}<small>Операции</small></span>
    <span class="fab">${ic("plus", 26)}</span>
    <span>${ic("pie", 22)}<small>Бюджеты</small></span>
    <span>${ic("menu", 22)}<small>Ещё</small></span>
  </nav>
</div>`;

const P = C.base.petrol, N = C.base.neutral;
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FinTrack — фирменный стиль</title>
<meta name="description" content="Превью фирменного стиля FinTrack v${T.meta.version}: логотипы, палитра, типографика, компоненты.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400..700&display=swap" rel="stylesheet">
<style>
:root{${vars(C.light)}--page:${N["25"]};}
.theme-light{${vars(C.light)}}
.theme-dark{${vars(C.dark)}}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:Onest,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--page);color:var(--foreground);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px}
section{padding:56px 0;border-top:1px solid var(--border)}
h1,h2,h3{margin:0;letter-spacing:-.01em}
h2{font-size:28px;line-height:36px;font-weight:700;margin-bottom:8px}
h3{font-size:18px;line-height:24px;font-weight:600}
.lead{color:var(--muted-foreground);max-width:720px;margin:0 0 28px}
.muted{color:var(--muted-foreground)}
.overline{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-foreground)}
.amount{font-variant-numeric:tabular-nums;white-space:nowrap}
.ic{flex:none;display:block}

/* шапка */
.hero-top{padding:56px 0 48px;display:grid;grid-template-columns:1.2fr 1fr;gap:40px;align-items:center}
.hero-top .kicker{font-size:13px;font-weight:600;color:var(--primary);letter-spacing:.04em;text-transform:uppercase}
.hero-top h1{font-size:44px;line-height:52px;font-weight:700;letter-spacing:-.02em;margin:10px 0 16px}
.hero-top p{font-size:18px;line-height:28px;color:var(--muted-foreground);margin:0}
.hero-logo{background:var(--card);border:1px solid var(--border);border-radius:24px;padding:40px;display:flex;flex-direction:column;gap:28px;align-items:flex-start}
.values{display:flex;flex-wrap:wrap;gap:8px}
.values span{border:1px solid var(--border);border-radius:999px;padding:4px 12px;font-size:14px;color:var(--secondary-foreground);background:var(--card)}

/* логотипы */
.concepts{display:grid;gap:20px}
.concept{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:20px}
.concept.rec{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary)}
.concept header{display:flex;gap:10px;align-items:center;margin-bottom:14px}
.badge-rec{font-size:12px;font-weight:600;color:var(--primary-subtle-foreground);background:var(--primary-subtle);border-radius:999px;padding:2px 10px}
.logo-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.tile{border-radius:14px;padding:22px;display:flex;flex-direction:column;align-items:flex-start;gap:20px}
.tile.light{background:${N["25"]};border:1px solid ${N["100"]}}
.tile.dark{background:${N["950"]}}
.sizes{display:flex;align-items:flex-end;gap:18px}
.sizes div{display:flex;flex-direction:column;align-items:center;gap:6px}
.sizes small{font-size:11px;color:${N["400"]}}
.concept p{margin:14px 0 0;color:var(--muted-foreground);font-size:15px}
.finwall{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}
.finwall .tile{flex:1;min-width:260px;flex-direction:row;align-items:center;justify-content:space-between}

/* иконки приложения */
.icons-row{display:flex;flex-wrap:wrap;gap:28px;align-items:flex-end}
.ai{margin:0;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:13px;color:var(--muted-foreground)}
.ai-mask{width:112px;height:112px;overflow:hidden;position:relative;box-shadow:0 6px 16px rgba(16,23,24,.12)}
.ai-mask.circle{border-radius:50%}.ai-mask.squircle{border-radius:32%}.ai-mask.rounded{border-radius:18%}
.ai-layer{position:absolute;width:150%;height:150%;left:-25%;top:-25%}
.ai-layer img{width:100%!important;height:100%!important}
.mono-demo{background:#DCE5E4;box-shadow:none}
.mono-demo img{filter:invert(27%) sepia(30%) saturate(900%) hue-rotate(140deg)}
.tabdemo{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--border);border-radius:10px 10px 0 0;padding:8px 14px;font-size:13px}

/* палитра */
.scale{display:grid;grid-template-columns:repeat(11,1fr);border-radius:14px;overflow:hidden;margin-bottom:12px}
.sw{padding:10px 8px;min-height:84px;display:flex;flex-direction:column;justify-content:flex-end;font-size:11px;line-height:15px}
.sw b{font-weight:600;font-size:12px}
.sem-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}
.sem{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.sem div{border-radius:12px;padding:12px;background:var(--card);border:1px solid var(--border);font-size:13px}
.sem i{display:block;height:36px;border-radius:8px;margin-bottom:8px}
.sem code{font-size:11px;color:var(--muted-foreground)}

/* панели тем */
.panels{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.panel{min-width:0;background:var(--background);color:var(--foreground);border-radius:24px;padding:20px;display:flex;flex-direction:column;gap:14px;border:1px solid var(--border)}
.panel-label{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-foreground)}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px}
.row-between{display:flex;justify-content:space-between;align-items:center;gap:12px}
.balance .hero{font-size:36px;line-height:44px;font-weight:600;letter-spacing:-.02em;margin:4px 0 8px}
.kop{font-size:.6em;color:var(--muted-foreground);font-weight:500;letter-spacing:0}
.balance .delta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:14px}
.chip-neutral{display:inline-flex;align-items:center;gap:4px;background:var(--subtle);border-radius:999px;padding:2px 10px;font-weight:500}
.eye{color:var(--muted-foreground)}
.accounts{margin-top:14px;display:grid;gap:6px;font-size:14px}
.accounts div{display:flex;align-items:center;gap:8px}
.accounts b{margin-left:auto;font-weight:500;font-variant-numeric:tabular-nums}
.dot{width:8px;height:8px;border-radius:50%}
.list{padding:4px 0}
.list-head{display:flex;justify-content:space-between;padding:10px 16px 4px;font-size:13px}
.tx{display:flex;align-items:center;gap:12px;padding:10px 16px;min-height:56px}
.tx+.tx{border-top:1px solid var(--border)}
.tx-icon{width:36px;height:36px;border-radius:10px;background:var(--subtle);color:var(--foreground);display:flex;align-items:center;justify-content:center;flex:none}
.tx-text{flex:1;min-width:0}
.tx-title{font-size:16px;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tx-sub{font-size:13px;line-height:18px;color:var(--muted-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tx-amt{display:flex;align-items:center;gap:4px;font-weight:500}
.tx-amt .dir{display:inline-flex;width:18px;height:18px;border-radius:50%;align-items:center;justify-content:center}
.tx-amt.income{color:var(--income)}.tx-amt.income .dir{background:var(--success-subtle)}
.tx-amt.expense{color:var(--expense)}.tx-amt.expense .dir{color:var(--muted-foreground);background:var(--subtle)}
.tx-amt.transfer{color:var(--transfer)}.tx-amt.transfer .dir{background:var(--subtle)}
.track{position:relative;height:8px;border-radius:4px;background:var(--subtle);margin-top:8px;overflow:hidden}
.fill{height:8px;border-radius:4px}.fill.ok{background:var(--primary)}.fill.warn{background:var(--warning-solid)}
.marker{position:absolute;top:0;width:2px;height:8px;background:var(--foreground);opacity:.55}
.note{display:flex;gap:6px;align-items:center;font-size:14px;margin-top:8px}
.warn-text{color:var(--warning)}
.advisor{background:var(--brand-accent-subtle);border-color:transparent}
.adv-head{display:flex;gap:8px;align-items:center;color:var(--brand-accent);font-weight:600;font-size:14px}
.advisor p{margin:8px 0 12px}
.advisor.slim p{margin:6px 0 0;font-size:14px}
.adv-actions{display:flex;gap:8px;flex-wrap:wrap}
.adv-foot{font-size:12px;color:var(--muted-foreground);margin-top:10px}
.buttons{display:flex;flex-wrap:wrap;gap:8px}
.btn{font:inherit;font-weight:600;font-size:15px;border-radius:12px;min-height:44px;padding:0 16px;display:inline-flex;align-items:center;gap:8px;border:1px solid transparent;cursor:pointer}
.btn-primary{background:var(--primary);color:var(--primary-foreground)}
.btn-primary:disabled{opacity:.45;cursor:not-allowed}
.btn-secondary{background:var(--card);color:var(--foreground);border-color:var(--input)}
.btn-ghost{background:transparent;color:var(--primary)}
.btn-danger{background:var(--card);color:var(--destructive);border-color:var(--destructive)}
.btn-advisor{background:var(--brand-accent);color:var(--brand-accent-foreground)}
.banners{display:grid;gap:8px}
.banner{display:flex;gap:10px;align-items:flex-start;border-radius:14px;padding:12px 14px;font-size:14px;line-height:20px}
.banner .ic{margin-top:1px}
.b-error{background:var(--destructive-subtle);color:var(--foreground)}.b-error .ic{color:var(--destructive)}
.b-success{background:var(--success-subtle);color:var(--foreground)}.b-success .ic{color:var(--success)}
.empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:24px}
.empty .muted{max-width:340px;font-size:14px}
.empty .adv-actions{margin-top:6px;justify-content:center}

/* типографика */
.type-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:24px}
.specimen{min-width:0;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:24px}
.specimen .big{font-size:64px;line-height:68px;font-weight:700;letter-spacing:-.03em}
.specimen .abc{font-size:22px;line-height:32px;margin-top:10px;color:var(--secondary-foreground)}
.type-row{display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:baseline;padding:10px 0;border-top:1px solid var(--border)}
.type-row code{font-size:12px;color:var(--muted-foreground)}
.amount-demo{display:grid;gap:14px;align-content:start}
.amount-demo .big{font-size:44px;line-height:52px;font-weight:600;letter-spacing:-.02em}
.anatomy{display:flex;gap:2px;align-items:flex-end;flex-wrap:wrap;font-size:40px;font-weight:600;font-variant-numeric:tabular-nums}
.anatomy span{display:flex;flex-direction:column;align-items:center}
.anatomy small{font-size:11px;font-weight:500;color:var(--muted-foreground);margin-top:4px;white-space:nowrap}
.anatomy em{font-style:normal;background:var(--primary-subtle);border-radius:6px;padding:0 3px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:18px}
.cols div{background:var(--subtle);border-radius:12px;padding:12px 14px;text-align:right}
.cols .prop{font-variant-numeric:proportional-nums}
.cols .tab{font-variant-numeric:tabular-nums}
.signals{display:grid;gap:10px}.signals div{display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:center;font-size:13px;color:var(--muted-foreground)}.signals .tx-amt{font-size:16px;justify-content:flex-end}
.cols b{display:block;text-align:left;font-size:12px;color:var(--muted-foreground);font-weight:600}

/* голос */
.voice{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.vcard{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;font-size:15px}
.vcard h3{font-size:15px;margin-bottom:10px}
.vgood,.vbad{border-radius:10px;padding:10px 12px;margin-top:8px;line-height:21px}
.vgood{background:var(--success-subtle)}.vbad{background:var(--destructive-subtle)}
.vgood b,.vbad b{display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:2px}
.vgood b{color:var(--success)}.vbad b{color:var(--destructive)}

/* телефон */
.phones{display:flex;gap:40px;justify-content:center;flex-wrap:wrap}
.phone{width:360px;height:760px;border-radius:44px;background:var(--background);color:var(--foreground);border:10px solid #0b0f10;position:relative;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(16,23,24,.25)}
.status{display:flex;justify-content:space-between;padding:12px 22px 4px;font-size:14px;font-weight:600}
.st-icons{display:flex;gap:5px;align-items:center}.st-icons i{width:14px;height:10px;border-radius:2px;background:var(--foreground);opacity:.8}.st-icons i.bat{width:22px}
.ph-head{display:flex;align-items:center;gap:10px;padding:10px 16px}
.ph-title{font-size:24px;font-weight:700;letter-spacing:-.01em;flex:1}
.ph-bell{color:var(--foreground)}
.ph-body{flex:1;overflow:hidden;padding:0 12px;display:flex;flex-direction:column;gap:10px}
.phone .card{padding:14px}
.phone .balance .hero{font-size:32px;line-height:40px;margin:2px 0 4px}
.phone .delta{font-size:14px}
.bar{display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;margin-top:12px}.bar i{display:block;height:8px}
.section-title{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-foreground);padding:4px 4px 0}
.phone .list{padding:0}
.phone .tx{padding:9px 12px;min-height:54px}
.phone .tx-title{font-size:15px}
.tabbar{display:flex;align-items:center;justify-content:space-around;border-top:1px solid var(--border);background:var(--card);padding:6px 4px 16px}
.tabbar span{display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--muted-foreground);width:60px}
.tabbar small{font-size:11px;font-weight:500}
.tabbar .active{color:var(--primary)}
.tabbar .fab{width:52px;height:52px;border-radius:50%;background:var(--primary);color:var(--primary-foreground);justify-content:center;transform:translateY(-10px);box-shadow:${T.elevation.fab}}

/* токены */
.tok{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.tok>div{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;font-size:14px}
.radii{display:flex;gap:10px;align-items:flex-end;margin-top:10px}
.radii i{display:block;width:44px;height:44px;background:var(--primary-subtle);border:1.5px solid var(--primary)}
.spaces{display:flex;gap:6px;align-items:flex-end;margin-top:10px}
.spaces i{display:block;background:var(--primary);border-radius:2px;width:10px}
footer{padding:40px 0 60px;color:var(--muted-foreground);font-size:14px;border-top:1px solid var(--border)}

@media (max-width:900px){
  .hero-top,.type-grid,.panels,.sem-grid,.voice,.logo-pair{grid-template-columns:minmax(0,1fr)}
  .tok{grid-template-columns:1fr 1fr}
  .scale{grid-template-columns:repeat(6,1fr)!important}
  .hero-top h1{font-size:34px;line-height:42px}
}
@media (max-width:520px){
  .wrap{padding:0 16px}
  .tok{grid-template-columns:1fr}
  .phone{width:100%;max-width:360px}
  .cols{grid-template-columns:1fr}
  .signals div{grid-template-columns:1fr}.signals .tx-amt{justify-content:flex-start}
  .scale{grid-template-columns:repeat(3,1fr)!important}
  .sem{grid-template-columns:repeat(2,1fr)}
  .anatomy{font-size:30px}
}
</style>
</head>
<body>
<div class="wrap">

<header class="hero-top">
  <div>
    <div class="kicker">Фирменный стиль · v${T.meta.version} · предложение</div>
    <h1>Спокойная картина ваших денег — поверх всех банков</h1>
    <p>FinTrack собирает счета из разных банков в одну честную картину и подсказывает, где можно сэкономить. Мы ничего не продаём от имени банков, поэтому стиль — тихий и точный: петроль вместо банковского синего, цифры на первом месте, ни одного крика.</p>
    <div class="values" style="margin-top:20px"><span>Честность</span><span>Спокойствие</span><span>Ясность</span><span>Независимость</span><span>Бережность к данным</span></div>
  </div>
  <div class="hero-logo">
    ${L("logos/d-gran/logo-light.svg", 56, "Логотип FinTrack")}
    <div style="display:flex;gap:14px;align-items:center">${L("logos/d-gran/mark-light.svg", 48)}${L("logos/d-gran/mark-light.svg", 32)}${L("logos/d-gran/mark-light.svg", 24)}${L("logos/d-gran/mark-light.svg", 16)}</div>
    <span class="muted" style="font-size:14px">Знак «Грань»: финансовые потоки со всех счетов сходятся в одну точку — у вас.</span>
  </div>
</header>

<section>
  <h2>Логотип: «Грань» и прежние концепции</h2>
  <p class="lead">Все знаки построены на сетке 48 × 48 из простых фигур, читаются в 16–24 px и не используют цвета и формы крупных банков (щит, галочка в круге, косые полосы, буквы А и Т).</p>
  <div class="concepts">
    ${concept("d-gran", "D. «Грань»", "Алмаз: сплошная корона и три грани, которые сходятся в одну точку. Грани — финансовые потоки со всех счетов и банков, корона — общий взгляд сверху. Знак не зависит от имени сервиса и продолжает 💎, который раньше стоял на сайте. Выбран владельцем 26.10.2026.", true)}
    ${concept("a-kladka", "A. «Кладка»", "Прежний знак. Сплошной верхний слой лежит на двух рядах «кирпичей» разной длины. Кирпичи — ваши счета в разных банках, верхний слой — FinTrack, который видит их все сразу. Знак буквально рисует позиционирование «советник поверх всех банков» и подходит обоим именам: для FinTrack это стопка счетов, для Finwall — стена. В 16 px остаются три полосы — знак не рассыпается.", false)}
    ${concept("b-gorizont", "B. «Горизонт»", "Полукруг над линией горизонта и две полосы отражения. Про спокойствие и взгляд вперёд: цели, прогноз, «чем закончится месяц». Тёплый и понятный, но жанр «солнце над водой» распространён — защищать такой знак сложнее, и про «поверх всех банков» он не говорит.", false)}
    ${concept("c-f-balans", "C. «Ф-баланс»", "Кириллическая «Ф»: два полудиска — доходы и расходы — и стержень между ними. Сразу русский продукт и «финансы», выглядит как весы. Минусы: «Ф» не связана с латинским именем, а в 16 px стержень спорит с полудисками.", false)}
  </div>
  <div class="finwall">
    <div class="tile light">${L("logos/a-kladka/logo-finwall-light.svg", 36, "Логотип Finwall")}<span class="muted" style="font-size:13px">если выберете имя Finwall</span></div>
    <div class="tile dark">${L("logos/a-kladka/logo-finwall-dark.svg", 36, "Логотип Finwall, тёмный")}</div>
  </div>
</section>

<section>
  <h2>Иконка приложения и favicon</h2>
  <p class="lead">Android adaptive icon: фон и передний план — отдельные слои 108 × 108 dp, знак целиком в безопасном круге 66 dp, поэтому любая маска лаунчера его не обрежет. Монохромный слой — для тематических иконок Android 13+.</p>
  <div class="icons-row">
    ${adaptive("circle", "Круг")}
    ${adaptive("squircle", "Сквиркл")}
    ${adaptive("rounded", "Скруглённый квадрат")}
    <figure class="ai"><div class="ai-mask rounded" style="box-shadow:none">${svgImg("app-icon/android/safe-zone-guide.svg", 112)}</div><figcaption>Безопасная зона</figcaption></figure>
    <figure class="ai"><div class="ai-mask circle mono-demo"><div class="ai-layer">${svgImg("app-icon/android/ic_launcher_monochrome.svg", 0).replace("height:0px", "")}</div></div><figcaption>Тематическая (Android 13+)</figcaption></figure>
    <figure class="ai"><div class="tabdemo">${svgImg("app-icon/favicon.svg", 16)} FinTrack — Главная</div><figcaption>Favicon во вкладке</figcaption></figure>
  </div>
</section>

<section>
  <h2>Палитра</h2>
  <p class="lead">Основной цвет «Петроль» — сине-бирюзовый, тон около 184°. Он спокойный, «финансовый» и при этом не совпадает с синим ВТБ и Газпромбанка, зелёным Сбера, жёлтым Т-Банка и красным Альфы. «Сирень» — только для советов и AI. Нейтральные «Графит» — с холодным подтоном петроля.</p>
  ${scale(C.base.petrol, "Петроль")}
  <div class="scale" style="grid-template-columns:repeat(7,1fr)">${Object.entries(C.base.lilac).filter(([k]) => !k.startsWith("$")).map(([k, v]) => swatch(v, `Сирень ${k}`)).join("")}</div>
  <div class="scale" style="grid-template-columns:repeat(10,1fr)">${["0", "25", "50", "100", "200", "300", "400", "500", "700", "950"].map((k) => swatch(N[k], `Графит ${k}`)).join("")}</div>
  <div class="sem-grid">
    ${["light", "dark"].map((t) => `<div class="panel theme-${t}"><div class="panel-label">${t === "light" ? "Светлая" : "Тёмная"} тема — смыслы</div><div class="sem">
      ${[["primary", "Основной"], ["income", "Доход"], ["expense", "Расход"], ["transfer", "Перевод"], ["success", "Успех"], ["warning", "Внимание"], ["destructive", "Ошибка"], ["brand-accent", "Советник"]].map(([k, n]) => `<div><i style="background:var(--${k})"></i>${n}<br><code>--${k} ${C[t][k]}</code></div>`).join("")}
    </div></div>`).join("")}
  </div>
  <p class="muted" style="margin-top:16px;font-size:14px">Все пары «текст/фон» проходят WCAG AA (≥ 4,5:1), элементы интерфейса и графики — ≥ 3:1. Полная таблица — <code>contrast-report.md</code>. Расход не красный: трата — не ошибка. Доход и расход различаются знаком «+» / «−», иконкой направления и подписью для экранного диктора, а не только цветом.</p>
</section>

<section>
  <h2>Типографика</h2>
  <p class="lead">Onest — гротеск, спроектированный в первую очередь под кириллицу, лицензия OFL, есть в Google Fonts и в пакете <code>@expo-google-fonts/onest</code>. В шрифте есть табличные цифры (<code>tnum</code>), настоящий минус U+2212 и знак рубля.</p>
  <div class="type-grid">
    <div class="specimen">
      <div class="big">Аа Бб 0123</div>
      <div class="abc">Съешь же ещё этих мягких французских булок, да выпей чаю. FinTrack · 1&nbsp;234,50&nbsp;₽ · −15%</div>
      <div style="margin-top:18px">
        ${Object.entries(T.typography.scale).map(([k, s]) => `<div class="type-row"><code>${k}<br>${s.size}/${s.lineHeight} · ${s.weight}</code><span style="font-size:${Math.min(s.size, 40)}px;line-height:${Math.min(s.lineHeight, 48)}px;font-weight:${s.weight};letter-spacing:${s.letterSpacing}em;${s.tabular ? "font-variant-numeric:tabular-nums;" : ""}${k === "overline" ? "text-transform:uppercase;" : ""}">${s.tabular ? "−1 234,50 ₽" : k === "overline" ? "Последние операции" : "Траты за октябрь"}</span></div>`).join("")}
      </div>
    </div>
    <div class="specimen amount-demo">
      <h3>Сумма «−1 234,50 ₽»</h3>
      <div class="anatomy" aria-label="минус тысяча двести тридцать четыре рубля пятьдесят копеек">
        <span><em>−</em><small>U+2212</small></span>
        <span>1<small>тысячи</small></span>
        <span><em>&nbsp;</em><small>U+00A0</small></span>
        <span>234<small>tnum</small></span>
        <span><em>,</em><small>запятая</small></span>
        <span>50<small>копейки</small></span>
        <span><em>&nbsp;</em><small>U+00A0</small></span>
        <span>₽<small>после суммы</small></span>
      </div>
      <div class="big">${money("-1234.50", { split: true })}</div>
      <span class="muted" style="font-size:14px">В крупном балансе копейки и «₽» мельче и приглушены — взгляд цепляется за рубли. В строках списка — один размер.</span>
      <div class="cols">
        <div class="prop"><b>Пропорциональные — нельзя</b>11 111,11 ₽<br>48 900,00 ₽<br>−7 320,00 ₽</div>
        <div class="tab"><b>Табличные — так</b>11 111,11 ₽<br>48 900,00 ₽<br>−7 320,00 ₽</div>
      </div>
      <h3 style="margin-top:10px">Плюс и минус — не только цветом</h3>
      <div class="signals">
        <div><span class="tx-amt income"><span class="dir">${ic("in", 14)}</span>${money("86500", { signed: true })}</span><span>знак «+», стрелка внутрь, зелёный · диктор: «Доход, 86 500 рублей»</span></div>
        <div><span class="tx-amt expense"><span class="dir">${ic("out", 14)}</span>${money("-1234.50")}</span><span>минус U+2212, стрелка наружу, основной цвет текста — трата не ошибка</span></div>
        <div><span class="tx-amt transfer"><span class="dir">${ic("transfer", 14)}</span>${money("15000")}</span><span>без знака, двойная стрелка, серый — деньги остались вашими</span></div>
      </div>
    </div>
  </div>
</section>

<section>
  <h2>Компоненты</h2>
  <p class="lead">Карточки отделяются тонкой границей, тени — только у всплывающих слоёв и кнопки «+». Скругления: 12 px у полей и кнопок, 16 px у карточек, 24 px у листов.</p>
  <div class="panels">
    ${panel("light", components)}
    ${panel("dark", components)}
  </div>
</section>

<section>
  <h2>Экран приложения</h2>
  <p class="lead">Главная Android-приложения в двух темах: те же токены, что на сайте.</p>
  <div class="phones">${phone("light")}${phone("dark")}</div>
</section>

<section>
  <h2>Тон голоса — коротко</h2>
  <p class="lead">Говорим как спокойный знакомый, который разбирается в деньгах: по делу, с цифрами, без канцелярита и без давления. Подробно — <code>02-voice.md</code>.</p>
  <div class="voice">
    <div class="vcard"><h3>Ошибка</h3>
      <div class="vgood"><b>Так</b>Не получилось загрузить выписку: страницы 3–4 пустые. Скачайте файл в банке заново — обычно это помогает.</div>
      <div class="vbad"><b>Не так</b>Ошибка обработки файла. Обратитесь в службу поддержки.</div></div>
    <div class="vcard"><h3>Денежное предупреждение</h3>
      <div class="vgood"><b>Так</b>На кафе осталось 1&nbsp;600&nbsp;₽ на&nbsp;7&nbsp;дней. В прошлые месяцы к этому дню вы тратили меньше.</div>
      <div class="vbad"><b>Не так</b>⚠️ ВНИМАНИЕ! Вы превышаете бюджет! Срочно сократите расходы!</div></div>
    <div class="vcard"><h3>Совет</h3>
      <div class="vgood"><b>Так</b>Кешбэк 5% на&nbsp;АЗС есть у вашей второй карты. За сентябрь это было бы ещё 410&nbsp;₽.</div>
      <div class="vbad"><b>Не так</b>Оформите выгодную кредитную карту с кешбэком до 30%! Одобрение за 5 минут!</div></div>
  </div>
</section>

<section>
  <h2>Токены</h2>
  <div class="tok">
    <div><b>Скругления</b><div class="radii">${[4, 8, 12, 16, 24].map((r) => `<i style="border-radius:${r}px"></i>`).join("")}</div><span class="muted">4 · 8 · 12 · 16 · 24</span></div>
    <div><b>Отступы, шаг 4</b><div class="spaces">${[4, 8, 12, 16, 24, 32, 48].map((s) => `<i style="height:${s}px"></i>`).join("")}</div><span class="muted">4 · 8 · 12 · 16 · 24 · 32 · 48</span></div>
    <div><b>Иконки</b><div style="display:flex;gap:12px;margin:12px 0;color:var(--foreground)">${["home", "list", "pie", "cart", "spark", "upload"].map((n) => ic(n, 24)).join("")}</div><span class="muted">Lucide, линия 1,75, 16 · 20 · 24</span></div>
    <div><b>Касание</b><div style="margin:10px 0"><span style="display:inline-flex;width:48px;height:48px;border:1.5px dashed var(--primary);border-radius:12px;align-items:center;justify-content:center;color:var(--primary)">${ic("plus", 20)}</span></div><span class="muted">Цель касания ≥ 48 dp</span></div>
  </div>
</section>

<footer>FinTrack · фирменный стиль v${T.meta.version} (${T.meta.date}) · ${T.meta.status}. Шрифт Onest — SIL OFL 1.1. Иконки — Lucide (ISC). Файл собран из tokens.json скриптом scripts/build-preview.cjs.</footer>
</div>
</body>
</html>
`;
fs.writeFileSync(path.join(B, "brand-preview.html"), html);
console.log("brand-preview.html", (html.length / 1024).toFixed(0) + " KB");
