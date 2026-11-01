(() => {
  "use strict";
  const app = document.getElementById("app"), tipEl = document.getElementById("tip");
  const embedded = window.parent !== window;
  if (embedded) document.body.classList.add("embedded");
  let D = null;                      // data/pl.json
  const monthFiles = {};             // "2025-12" -> its days (data/m/2025-12.json)
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // ---------------------------------------------------------------- formatting
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cents = (v) => Math.round((v || 0) * 100);
  const tone = (v) => (cents(v) > 0 ? "up" : cents(v) < 0 ? "down" : "flat");
  const money = (v, opts = {}) => {
    const c = cents(v), whole = opts.whole || (opts.trim && c % 100 === 0), a = Math.abs(c) / 100;  // trim: "-$25" (his day image)
    const body = a.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
    if (opts.plain) return `$${body}`;
    return c > 0 ? `+$${body}` : c < 0 ? `-$${body}` : `$${body}`;
  };
  const M = (v, opts) => `<span class="${tone(v)}">${money(v, opts)}</span>`;
  const short = (v) => {  // +$4,439 / -$1.3k for small places
    const a = Math.abs(v), s = v > 0.004 ? "+" : v < -0.004 ? "-" : "";
    return `${s}$${a >= 10000 ? (a / 1000).toFixed(1) + "k" : Math.round(a).toLocaleString("en-US")}`;
  };
  const dt = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const mdy = (iso) => { const d = dt(iso); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`; };
  const monthName = (m) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
  const dayLong = (iso) => { const d = dt(iso); return `${WD[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
  const dayShort = (iso) => { const d = dt(iso); return `${WD[d.getUTCDay()].slice(0, 3)}, ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`; };
  const pct = (r) => `${Math.round(r * 100)}%`;
  const rateText = (rates) => !rates || !rates.length ? "" : rates.length === 1 ? `${pct(rates[0])} value`
    : `${pct(Math.min(...rates))}–${pct(Math.max(...rates))} value`;
  const bookName = (c) => (D.books[c] || {}).name || c;
  const bookColor = (c) => (D.books[c] || {}).color || "#94a3b8";
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const shade = (v, max) => {  // a day square's color: deeper the bigger the day
    if (!cents(v)) return "rgba(148,163,184,.12)";
    const k = Math.min(1, Math.sqrt(Math.abs(v) / (max || 1)));
    return v > 0 ? `rgba(34,197,94,${(0.16 + 0.5 * k).toFixed(3)})` : `rgba(239,68,68,${(0.16 + 0.42 * k).toFixed(3)})`;
  };

  // ---------------------------------------------------------------- lookups
  const yearOf = (y) => D.years.find((x) => x.y === +y);
  const monthOf = (m) => D.months.find((x) => x.m === m);
  const allDays = () => D.months.flatMap((m) => m.days.map((d) => d[0]));
  const dayRow = (iso) => { const m = monthOf(iso.slice(0, 7)); return m && m.days.find((d) => d[0] === iso); };
  async function loadMonth(m) {
    if (!monthFiles[m]) monthFiles[m] = fetch(`data/m/${m}.json`, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    return monthFiles[m];
  }

  // ---------------------------------------------------------------- routing: #/2025/12/14
  function route() {
    const p = (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
    const y = p[0] && yearOf(p[0]) ? +p[0] : null;
    const m = y && p[1] && monthOf(`${y}-${p[1].padStart(2, "0")}`) ? `${y}-${p[1].padStart(2, "0")}` : null;
    const d = m && p[2] && dayRow(`${m}-${p[2].padStart(2, "0")}`) ? `${m}-${p[2].padStart(2, "0")}` : null;
    return { y, m, d, level: d ? "day" : m ? "month" : y ? "year" : "all" };
  }
  const href = (y, m, d) => "#/" + [y, m && m.slice(5, 7), d && d.slice(8, 10)].filter(Boolean).join("/");
  const go = (h) => { if (location.hash !== h) location.hash = h; else render(); };

  // ---------------------------------------------------------------- shared pieces
  // the top row, as boostworld.us's own section looked (user, Nov 1: "I want the bottom one for the initial display, but I want
  // it to where they can click inside everything"): where you are as pills, and a menu of the level under this one
  const CHEV = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function header(r) {
    const pills = [`<button class="pill${r.level === "all" ? " on" : ""}" data-go="#/">All time</button>`];
    if (r.y) pills.push(`<span class="sep">›</span><button class="pill${r.level === "year" ? " on" : ""}" data-go="${href(r.y)}">${r.y}</button>`);
    if (r.m) pills.push(`<span class="sep">›</span><button class="pill${r.level === "month" ? " on" : ""}" data-go="${href(r.y, r.m)}">${MONTHS[+r.m.slice(5) - 1]}</button>`);
    if (r.d) pills.push(`<span class="sep">›</span><button class="pill on" data-go="${href(r.y, r.m, r.d)}">${esc(dayShort(r.d))}</button>`);
    let ph, opts;
    if (r.level === "all") { ph = "Pick a year"; opts = D.years.map((y) => [href(y.y), String(y.y)]); }
    else if (r.level === "year") { ph = "Pick a month"; opts = D.months.filter((m) => m.m.startsWith(`${r.y}-`)).map((m) => [href(r.y, m.m), MONTHS[+m.m.slice(5) - 1]]); }
    else { ph = "Pick a day"; opts = monthOf(r.m).days.map((d) => [href(r.y, r.m, d[0]), dayShort(d[0])]); }
    const here = href(r.y, r.m, r.d);
    return `<div class="nav"><nav class="pills" aria-label="Where you are">${pills.join("")}</nav>
      <label class="pick"><select data-pick aria-label="${ph}"><option value="">${ph}</option>${opts.map(([h, l]) =>
        `<option value="${h}"${h === here ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>${CHEV}</label></div>`;
  }
  function steps(r) {  // the level before / after
    let list, key, label, val, link;
    if (r.level === "year") { list = D.years.map((y) => String(y.y)); key = String(r.y); label = (k) => k; val = (k) => yearOf(k).pl; link = (k) => href(k); }
    else if (r.level === "month") { list = D.months.map((m) => m.m); key = r.m; label = monthName; val = (k) => monthOf(k).pl; link = (k) => href(k.slice(0, 4), k); }
    else if (r.level === "day") { list = allDays(); key = r.d; label = dayShort; val = (k) => dayRow(k)[1]; link = (k) => href(k.slice(0, 4), k.slice(0, 7), k); }
    else return "";
    const i = list.indexOf(key), prev = list[i - 1], next = list[i + 1];
    const title = r.level === "year" ? r.y : r.level === "month" ? monthName(r.m) : dayLong(r.d);
    const btn = (k, cls) => k ? `<button class="step ${cls}" data-go="${link(k)}" data-step="${cls}">${cls === "prev" ? '<span class="arrow">‹</span>' : ""}
        <span><span class="s-l">${esc(label(k))}</span><br><span class="s-v ${tone(val(k))}">${money(val(k))}</span></span>${cls === "next" ? '<span class="arrow">›</span>' : ""}</button>`
      : `<span class="step ${cls}" hidden></span>`;
    return `<div class="titlebar">${btn(prev, "prev")}<h2>${esc(title)}</h2>${btn(next, "next")}</div>
      <div class="keys">← / → before / after · Esc: up a level</div>`;
  }
  function cashBonus(o, rates) {
    return `<div class="cb"><div class="row"><span>Cash</span><b class="${tone(o.cash)}">${money(o.cash)}</b></div>
      <div class="row"><span>Bonus bets</span><b class="bonus">${money(o.bonus)}</b></div>
      <div class="note">counted at ${esc(rateText(rates))}</div></div>`;
  }
  function miniBars(values) {  // a year card's months: rounded bars from the bottom, a small month a dot, a losing one a red dot
    const max = Math.max(1, ...values);
    return `<div class="bars">${values.map((v) => `<i class="${v < 0 ? "neg" : ""}" style="height:${v > 0 ? Math.max(14, (v / max) * 100).toFixed(1) : 14}%"></i>`).join("")}</div>`;
  }
  function booksTable(rows, opts = {}) {
    // rows: [[code, pl, bets, won, lost]]; opts.second: {head, of(code)} a second amount column; opts.title / sub
    const books = rows.filter((r) => r[0] !== "N/A" && r[0] !== "NB"), na = rows.filter((r) => r[0] === "N/A" || r[0] === "NB");
    // (losers biggest loss first, as his page lists them; a book that broke even is its own group, never "down")
    const ups = books.filter((r) => cents(r[1]) > 0), downs = books.filter((r) => cents(r[1]) < 0).sort((a, b) => a[1] - b[1]);
    const evens = books.filter((r) => cents(r[1]) === 0);
    const max = Math.max(1, ...rows.map((r) => Math.abs(r[1])));
    const total = rows.reduce((t, r) => t + cents(r[1]), 0) / 100, bets = rows.reduce((t, r) => t + (r[2] || 0), 0);
    const line = (r, cls = "") => {
      const w = (Math.abs(r[1]) / max) * 50;
      const fill = cents(r[1]) >= 0 ? `left:50%;width:${w.toFixed(2)}%;background:linear-gradient(90deg,#16a34a,#4ade80)` : `right:50%;width:${w.toFixed(2)}%;background:linear-gradient(90deg,#fb7185,#ef4444)`;
      const open = opts.more ? `<tr class="more" data-more="${esc(r[0])}" hidden><td colspan="${opts.second ? 5 : 4}">${opts.more(r)}</td></tr>` : "";
      return `<tr class="row ${cls}" data-book="${esc(r[0])}"><td><span class="bk"><span class="dot" style="background:${bookColor(r[0])}"></span>${esc(r[0] === "N/A" ? "N/A (not tied to a book)" : bookName(r[0]))}</span></td>
        <td class="wide-only" style="width:34%"><div class="track"><span class="fill" style="${fill}"></span></div></td>
        <td class="r amt ${tone(r[1])}">${money(r[1])}</td>${opts.second ? `<td class="r sec">${opts.second.of(r[0])}</td>` : ""}
        <td class="r sec">${r[2] ? r[2].toLocaleString("en-US") : ""}</td></tr>${open}`;
    };
    const cols = opts.second ? 5 : 4;
    const grp = (label, list, cls) => list.length ? `<tr class="grp"><td colspan="${cols}"><span class="${cls}">${label}</span> <span class="${cls}">${money(list.reduce((t, r) => t + cents(r[1]), 0) / 100)}</span> <span class="faint" style="font-weight:600">· ${list.length} book${list.length === 1 ? "" : "s"}</span></td></tr>${list.map((r) => line(r)).join("")}` : "";
    // flat (all time): one list, the winners, N/A, then the losers best to worst, no group headers (user, Nov 1: "don't
    // categorize them as up all time, down all time ... doesn't draw so much attention to the red ones")
    if (opts.flat) {
      const order = [...ups, ...na, ...evens, ...downs.slice().reverse()];
      return `<table class="books"><thead><tr><th>Book</th><th class="wide-only"></th><th class="r">${esc(opts.head || "P/L")}</th>${opts.second ? `<th class="r">${esc(opts.second.head)}</th>` : ""}<th class="r">Bets</th></tr></thead>
        <tbody>${order.map((r) => line(r, r[0] === "N/A" || r[0] === "NB" ? "na" : "")).join("")}
        <tr class="total"><td>Total</td><td class="wide-only"></td><td class="r amt ${tone(total)}">${money(total)}</td>${opts.second ? `<td class="r sec">${opts.second.total || ""}</td>` : ""}<td class="r sec">${bets.toLocaleString("en-US")}</td></tr></tbody></table>`;
    }
    return `<table class="books"><thead><tr><th>Book</th><th class="wide-only"></th><th class="r">${esc(opts.head || "P/L")}</th>${opts.second ? `<th class="r">${esc(opts.second.head)}</th>` : ""}<th class="r">Bets</th></tr></thead>
      <tbody>${grp(`▲ ${opts.upLabel || "Up"}`, ups, "up")}${grp(`▼ ${opts.downLabel || "Down"}`, downs, "down")}${grp("● Even", evens, "flat")}${na.map((r) => line(r, "na")).join("")}
      <tr class="total"><td>Total</td><td class="wide-only"></td><td class="r amt ${tone(total)}">${money(total)}</td>${opts.second ? `<td class="r sec">${opts.second.total || ""}</td>` : ""}<td class="r sec">${bets.toLocaleString("en-US")}</td></tr></tbody></table>`;
  }
  // ---------------------------------------------------------------- charts
  function attachTip(root) {
    root.querySelectorAll("[data-tip]").forEach((el) => {
      el.addEventListener("mousemove", (e) => { tipEl.innerHTML = el.dataset.tip; tipEl.classList.add("on");
        const w = tipEl.offsetWidth; tipEl.style.left = `${Math.min(window.innerWidth - w - 8, e.clientX + 14)}px`; tipEl.style.top = `${e.clientY + 14}px`; });
      el.addEventListener("mouseleave", () => tipEl.classList.remove("on"));
    });
  }
  function barChart(points, opts = {}) {
    // points: [{key, label, v, tip, go, axis}], opts.line: running total
    const el = document.createElement("div");
    el.className = "chart";
    el.dataset.chart = "1";
    el._draw = () => {
      const W = Math.max(280, el.clientWidth || 900), H = opts.h || 280, pad = { l: 58, r: opts.line ? 58 : 10, t: 14, b: 30 };
      const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      const vals = points.map((p) => p.v), maxUp = Math.max(0, ...vals), maxDn = Math.max(0, ...vals.map((v) => -v));
      const span = maxUp + maxDn || 1, y0 = pad.t + ih * (maxUp / span), sc = ih / span;
      const bw = iw / points.length, gap = Math.min(6, bw * .22);
      let run = 0;
      const runs = points.map((p) => (run += p.v));
      const rMax = Math.max(1, ...runs), rMin = Math.min(0, ...runs);
      const ry = (v) => pad.t + ih * (1 - (v - rMin) / (rMax - rMin || 1));
      const nice = (v) => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`;
      let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "chart")}">`;
      [maxUp, maxUp / 2, 0, -maxDn].filter((v, i, a) => (v || i === 2) && a.indexOf(v) === i).forEach((v) => {
        const y = y0 - v * sc;
        svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="rgba(148,163,184,${v === 0 ? .32 : .09})" ${v === 0 ? "" : 'stroke-dasharray="3 5"'}/>
          <text x="${pad.l - 10}" y="${y + 4}" text-anchor="end">${v === 0 ? "$0" : (v < 0 ? "-" : "") + nice(Math.abs(v))}</text>`;
      });
      if (opts.line) [rMax, (rMax + rMin) / 2].forEach((v) => { svg += `<text x="${W - pad.r + 8}" y="${ry(v) + 4}" fill="#a5b4fc" style="fill:#a5b4fc">${nice(v)}</text>`; });
      points.forEach((p, i) => {
        const x = pad.l + i * bw + gap / 2, w = Math.max(1, bw - gap), h = Math.abs(p.v) * sc;
        const y = p.v >= 0 ? y0 - h : y0;
        svg += `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(p.v ? 1.5 : 0, h)}" rx="${Math.min(4, w / 3)}" fill="${p.v >= 0 ? "url(#gUp)" : "url(#gDn)"}"/>`;
        if (p.axis) svg += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(p.axis)}</text>`;
      });
      if (opts.line) {
        const path = runs.map((v, i) => `${i ? "L" : "M"}${(pad.l + i * bw + bw / 2).toFixed(1)},${ry(v).toFixed(1)}`).join("");
        svg += `<path d="${path}" fill="none" stroke="#a5b4fc" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      points.forEach((p, i) => {
        svg += `<rect class="hit" x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent" data-go="${p.go || ""}"
          data-tip="${esc(`${p.label}<br><b class='${tone(p.v)}'>${money(p.v)}</b>${opts.line ? `<br><span class='muted'>running total</span> <b style='color:#a5b4fc'>${money(runs[i])}</b>` : ""}${p.tip ? `<br><span class='muted'>${p.tip}</span>` : ""}`)}"/>`;
      });
      svg += `<defs><linearGradient id="gUp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#16a34a"/></linearGradient>
        <linearGradient id="gDn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#fb7185"/></linearGradient></defs></svg>`;
      el.innerHTML = svg;
      attachTip(el);
    };
    return el;
  }
  // The climb (user, Nov 1: "one graph the whole way through, that you can hover over each month and see the monthly total, as
  // well as the all-time total at that given time"; it loads first, right under boostworld.us's All-Time Total; "click on ...
  // a certain month ... and then be taken to that month"): the overall P/L at each month's end as one smooth line over a soft
  // fill, a marker where each year starts, a readout that follows the pointer (mouse or finger), a click (or a tap on the
  // readout) opens that month.
  function climbChart() {
    const el = document.createElement("div");
    el.className = "climb";
    el.dataset.chart = "1";
    const pts = D.months.map((m) => ({ m: m.m, pl: m.pl, od: m.od }));
    el._focus = null;  // the page's place ({y, m}): its year shaded, its month marked
    el._draw = () => {
      const W = Math.max(300, el.clientWidth - 44 || 1000), narrow = W < 640, H = narrow ? 270 : 460;  // (big, like his old chart)
      const pad = { l: narrow ? 46 : 62, r: narrow ? 14 : 24, t: 20, b: 40 };
      const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, n = pts.length;
      const hi = Math.max(1, ...pts.map((p) => p.od)), lo = Math.min(0, ...pts.map((p) => p.od));
      const raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = [1, 2, 2.5, 4, 5, 10].map((k) => k * mag).find((k) => k >= raw) || 10 * mag;  // ($40k steps: 0 to $160k)
      const top = Math.ceil(hi / step) * step, bot = Math.floor(lo / step) * step;
      const X = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw), Y = (v) => pad.t + ih * (1 - (v - bot) / (top - bot || 1));
      const k = (v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
      // a smooth line that never bends past a point (monotone cubic)
      const xs = pts.map((_, i) => X(i)), ys = pts.map((p) => Y(p.od));
      const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
      const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2) || 0);
      for (let i = 0; i < n - 1; i++) {
        if (!d[i]) { m[i] = m[i + 1] = 0; continue; }
        const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
        if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
      }
      let line = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
      for (let i = 0; i < n - 1; i++) {
        const dx = (xs[i + 1] - xs[i]) / 3;
        line += `C${(xs[i] + dx).toFixed(1)},${(ys[i] + m[i] * dx).toFixed(1)} ${(xs[i + 1] - dx).toFixed(1)},${(ys[i + 1] - m[i + 1] * dx).toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
      }
      const base = Y(Math.max(bot, 0)).toFixed(1);
      const area = `${line}L${xs[n - 1].toFixed(1)},${base}L${xs[0].toFixed(1)},${base}Z`;
      let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Overall P/L at the end of every month since ${mdy(D.since)}">
        <defs><linearGradient id="clFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e" stop-opacity=".32"/><stop offset=".7" stop-color="#22c55e" stop-opacity=".06"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></linearGradient>
        <filter id="clGlow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
      for (let v = bot; v <= top + 1e-6; v += step) {
        svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(148,163,184,${v === 0 ? .28 : .1})" ${v === 0 ? "" : 'stroke-dasharray="3 6"'}/>
          <text x="${pad.l - 12}" y="${Y(v) + 4}" text-anchor="end">${k(v)}</text>`;
      }
      let lastLabel = -1e9;
      pts.forEach((p, i) => {  // each year where it starts: a quiet marker, and its name under the axis (never two on top of each other)
        if (!p.m.endsWith("-01") && i !== 0) return;
        if (i !== 0) svg += `<line x1="${X(i)}" x2="${X(i)}" y1="${pad.t}" y2="${pad.t + ih}" stroke="rgba(148,163,184,.14)"/>`;
        if (X(i) - lastLabel < 62) return;
        lastLabel = X(i);
        svg += `<text x="${X(i)}" y="${H - 12}" text-anchor="${i === 0 ? "start" : "middle"}" class="yr">${p.m.slice(0, 4)}</text>`;
      });
      const f = el._focus || {}, fy = f.y && !f.m ? pts.map((p, i) => (p.m.startsWith(`${f.y}-`) ? i : -1)).filter((i) => i >= 0) : [];
      if (fy.length) {  // a year open below: its stretch of the line shaded
        const x0 = fy[0] === 0 ? pad.l : (X(fy[0] - 1) + X(fy[0])) / 2, x1 = fy[fy.length - 1] === n - 1 ? W - pad.r : (X(fy[fy.length - 1]) + X(fy[fy.length - 1] + 1)) / 2;
        svg += `<rect x="${x0}" y="${pad.t}" width="${x1 - x0}" height="${ih}" fill="rgba(34,197,94,.07)" rx="6"/>`;
      }
      svg += `<path d="${area}" fill="url(#clFill)"/><path class="cl-line${el._drawn ? "" : " anim"}" d="${line}" fill="none" stroke="#22c55e" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" filter="url(#clGlow)"/>
        <circle cx="${xs[n - 1]}" cy="${ys[n - 1]}" r="4.5" fill="#4ade80" class="cl-end"/>`;
      const fm = f.m ? pts.findIndex((p) => p.m === f.m) : -1;
      if (fm >= 0) {  // a month open below: marked on the line
        svg += `<line x1="${xs[fm]}" x2="${xs[fm]}" y1="${pad.t}" y2="${pad.t + ih}" stroke="rgba(74,222,128,.45)" stroke-dasharray="4 4"/>
          <circle cx="${xs[fm]}" cy="${ys[fm]}" r="7" fill="#22c55e" stroke="#0b1322" stroke-width="3"/>`;
      }
      svg += `
        <line class="cl-guide" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" stroke="rgba(226,232,240,.5)" stroke-width="1" visibility="hidden"/>
        <circle class="cl-dot" r="6" fill="#0b1322" stroke="#4ade80" stroke-width="3" visibility="hidden"/>
        <rect class="cl-hit" x="${pad.l - 8}" y="0" width="${iw + 16}" height="${H}" fill="transparent"/></svg>`;
      el._drawn = true;
      el.innerHTML = `<div class="cl-head"><div><h3>All-time P/L, month by month</h3><div class="s">since ${mdy(D.since)} · hover a month · click to open it</div></div></div>
        <div class="cl-plot">${svg}<button type="button" class="cl-tip" hidden></button></div>`;
      const plot = el.querySelector(".cl-plot"), tip = el.querySelector(".cl-tip"), guide = el.querySelector(".cl-guide"), dot = el.querySelector(".cl-dot");
      const at = (e) => { const r = plot.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) - pad.l) / (iw / Math.max(1, n - 1))))); };
      const show = (i) => {
        const p = pts[i];
        guide.setAttribute("x1", xs[i]); guide.setAttribute("x2", xs[i]); guide.setAttribute("visibility", "visible");
        dot.setAttribute("cx", xs[i]); dot.setAttribute("cy", ys[i]); dot.setAttribute("visibility", "visible");
        // (his old chart's way: "May 2024 P/L" and its number, then All-Time; user, Nov 1: "you don't need May 2024 to then month PL")
        tip.innerHTML = `<div class="t">${esc(`${MONTHS[+p.m.slice(5) - 1].slice(0, 3)} ${p.m.slice(0, 4)}`)} P/L</div><b class="v ${tone(p.pl)}">${money(p.pl)}</b>
          <div class="t sep">All-Time</div><b class="v sm ${tone(p.od)}">${money(p.od)}</b>`;
        tip.dataset.go = href(p.m.slice(0, 4), p.m);
        tip.hidden = false;
        const tw = tip.offsetWidth, want = xs[i] + 16 + tw > W ? xs[i] - 16 - tw : xs[i] + 16;
        const left = Math.max(0, Math.min(W - tw, want));  // (never past the chart's edges: a phone had cut it off)
        tip.style.left = `${left}px`; tip.style.top = `${Math.max(4, Math.min(H - tip.offsetHeight - 4, ys[i] - tip.offsetHeight / 2))}px`;
      };
      const hide = () => { tip.hidden = true; guide.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); };
      const hit = el.querySelector(".cl-hit");
      hit.addEventListener("pointermove", (e) => show(at(e)));
      hit.addEventListener("pointerdown", (e) => show(at(e)));
      hit.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") hide(); });
      // a click on the line opens that month (a finger's tap shows the readout first; a tap on it opens the month)
      hit.addEventListener("click", (e) => { const p = pts[at(e)]; if (p && e.pointerType !== "touch") go(href(p.m.slice(0, 4), p.m)); });
      hit.style.cursor = "pointer";
    };
    return el;
  }
  function mountCharts(nodes) {
    app.querySelectorAll("[data-chart-slot]").forEach((slot) => { const c = nodes[slot.dataset.chartSlot]; if (c) { slot.replaceWith(c); c._draw(); } });
  }

  // ---------------------------------------------------------------- views
  // a year opened on All time: its months under the cards, two columns, each a bar by its size (user, Nov 1, of the section
  // boostworld.us had built itself: "I do like how this part displays here"); a month opens its own page, and the year's
  // whole page (calendars, sportsbooks) is one click more
  let openYear = null;
  function yearPanel(y) {
    if (!y) return "";
    const ms = D.months.filter((m) => m.m.startsWith(`${y.y}-`)), max = Math.max(1, ...ms.map((m) => Math.abs(m.pl)));
    return `<div class="ypanel fade"><div class="yp-h"><div><b>${y.y}</b> <span class="muted">· ${ms.length} month${ms.length === 1 ? "" : "s"}</span></div>
        <b class="${tone(y.pl)}">${money(y.pl)}</b></div>
      <div class="yp-grid">${ms.map((m) => `<button class="yp-row" data-go="${href(y.y, m.m)}"><span class="mn">${MONTHS[+m.m.slice(5) - 1].slice(0, 3)}</span>
        <span class="track"><i class="${m.pl < 0 ? "neg" : ""}" style="width:${Math.max(2, (Math.abs(m.pl) / max) * 100).toFixed(1)}%"></i></span>
        <b class="${tone(m.pl)}">${money(m.pl)}</b></button>`).join("")}</div>
      <div class="yp-f"><button class="yp-open" data-go="${href(y.y)}">Open ${y.y}: every month's calendar and sportsbooks ›</button></div></div>`;
  }
  function viewAll() {
    const years = D.years;
    const yearsSpan = (() => { const a = dt(D.since), b = dt(D.through); const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() + 1; return `${Math.floor(m / 12)} years, ${m % 12} months`; })();
    const cards = years.map((y) => {
      const ms = D.months.filter((m) => m.m.startsWith(`${y.y}-`));
      return `<button class="ycard${openYear === y.y ? " on" : ""}" data-year="${y.y}" aria-expanded="${openYear === y.y}"><div class="yh"><span class="yn">${y.y}</span>${CHEV}</div>
        <div class="yt ${tone(y.pl)}">${money(y.pl)}</div><div class="ym">${ms.length} month${ms.length === 1 ? "" : "s"}</div>${miniBars(ms.map((m) => m.pl))}</button>`;
    }).join("");
    const html = `<div class="hero2"><div class="big ${tone(D.overall)}">${money(D.overall)}</div>
        <div class="sub">All time · since ${mdy(D.since)}</div><div class="sub">${yearsSpan} · click a year to open it</div></div>
      <div class="ycards">${cards}</div>${openYear ? yearPanel(yearOf(openYear)) : ""}
      <details class="panel drop"><summary><div><h3>Every sportsbook · all time</h3><div class="s">${D.all_books.filter((b) => b[0] !== "N/A").length} books · click to open</div></div>${CHEV}</summary>
        ${booksTable(D.all_books, { head: "All time", flat: true, more: (r) => {
          const ys = D.years.map((y) => [y.y, (y.books.find((b) => b[0] === r[0]) || [])[1]]).filter((x) => x[1] !== undefined);
          const span = (D.books[r[0]] || {}).span || [];
          return `<div class="yrs">${ys.map(([y, v]) => `<span>${y} ${M(v)}</span>`).join("")}${r[2] ? `<span class="muted">${r[3]} won · ${r[4]} lost</span>` : ""}${span[0] ? `<span class="muted">${mdy(span[0])} – ${mdy(span[1])}</span>` : ""}</div>`;
        } })}</details>`;
    return { html, charts: {} };
  }

  // an amount outside the year's months (FanDuel's Dinger Tuesday, 2022): a quiet line at the foot of its year only (user, Nov 1:
  // "a note or something saying ... that there is the FanDuel Dinger Tuesday, but I don't want that to be so like blaring obvious")
  function outsideNote(y) {  // (Nov 1: "say that I was tracking it separately and then decided to just add it all into the overall")
    const dinger = (y.outside || []).filter((o) => o.book === "FD");
    if (!dinger.length) return "";
    const o = dinger[0];
    return `<div class="fine"><b>About ${y.y}'s total:</b> FanDuel's Dinger Tuesday promo (${money(o.pl)}) was tracked separately at first.
      On ${mdy(o.d)} we added all of it to the overall P/L, so it counts in ${y.y}'s total but isn't part of any one month.</div>`;
  }
  function viewYear(r) {
    const y = yearOf(r.y), ms = D.months.filter((m) => m.m.startsWith(`${r.y}-`));
    const lastDay = ms.length ? ms[ms.length - 1].days.slice(-1)[0][0] : null;
    const overallThen = lastDay ? (D.months.filter((m) => m.m <= lastDay.slice(0, 7)).reduce((t, m) => t + cents(m.pl), 0)
      + D.years.filter((x) => x.y <= r.y).flatMap((x) => x.outside || []).reduce((t, o) => t + cents(o.pl), 0)) / 100 : 0;
    const full = r.y < +D.through.slice(0, 4) || D.through.endsWith("-12-31");
    const cards = ms.map((m) => {
      const first = dt(`${m.m}-01`).getUTCDay(), n = new Date(Date.UTC(+m.m.slice(0, 4), +m.m.slice(5, 7), 0)).getUTCDate();
      const by = Object.fromEntries(m.days.map((d) => [+d[0].slice(8), d])), max = Math.max(1, ...m.days.map((d) => Math.abs(d[1])));
      let cells = ["S", "M", "T", "W", "T", "F", "S"].map((h) => `<span class="h">${h}</span>`).join("") + "<span></span>".repeat(first);
      for (let i = 1; i <= n; i++) {
        const d = by[i];
        cells += d ? `<span class="c has" data-go="${href(r.y, m.m, d[0])}" style="background:${shade(d[1], max)}" data-tip="${esc(`${dayShort(d[0])}<br><b class='${tone(d[1])}'>${money(d[1])}</b><br><span class='muted'>${d[3]} bets</span>`)}">${i}</span>`
          : `<span class="c none">${i}</span>`;
      }
      return `<div class="card${m.pl < 0 ? " neg" : ""}" role="button" tabindex="0" data-go="${href(r.y, m.m)}"><div class="name">${MONTHS[+m.m.slice(5) - 1]}</div>
        <div class="total ${tone(m.pl)}">${money(m.pl)}</div>${cashBonus(m, m.rates)}<div class="meta">${m.days.length} days${m.full ? "" : " so far"}</div><div class="mcal">${cells}</div></div>`;
    }).join("");
    const pts = ms.map((m) => ({ label: monthName(m.m), v: m.pl, go: href(r.y, m.m), axis: MONTHS[+m.m.slice(5) - 1].slice(0, 3) }));
    const html = `${steps(r)}<div class="hero"><div><div class="k">${r.y} P/L ${full ? "(full year)" : `through ${mdy(D.through)}`}</div><div class="big ${tone(y.pl)}">${money(y.pl)}</div>
        <div class="sub">Cash ${M(y.cash)} · <span class="bonus">Bonus bets won ${money(y.bonus)}</span> (worth ${money(y.worth, { plain: true })} at ${esc(rateText(y.rates).replace(" value", ""))})</div></div>
        <div class="side"><div class="kv"><div class="k">Winning months</div><div class="v">${ms.filter((m) => m.pl > 0).length} of ${ms.length}</div></div>
        <div class="kv"><div class="k">Overall since ${mdy(D.since)}</div><div class="v ${tone(overallThen)}">${money(overallThen)}</div></div></div></div>
      <div class="cards months">${cards}</div>
      <div class="panel"><div class="ph"><div><h3>Each month · ${r.y}</h3><div class="s">click a month to open it</div></div></div><div data-chart-slot="months"></div></div>
      <div class="panel"><div class="ph"><div><h3>Sportsbooks · ${r.y}</h3></div></div>${booksTable(y.books, { head: String(r.y), upLabel: "Up this year", downLabel: "Down this year" })}</div>
      ${outsideNote(y)}`;
    return { html, charts: { months: barChart(pts, { h: 260, label: `${r.y} by month` }) } };
  }

  function viewMonth(r) {
    const m = monthOf(r.m), y = yearOf(r.y);
    const strip = MONTHS.map((nm, i) => {
      const k = `${r.y}-${String(i + 1).padStart(2, "0")}`, x = monthOf(k);
      return x ? `<button class="${k === r.m ? "on" : ""}" data-go="${href(r.y, k)}"><div class="m">${nm.slice(0, 3)}</div><div class="v ${tone(x.pl)}">${short(x.pl)}</div></button>`
        : `<button class="off" disabled><div class="m">${nm.slice(0, 3)}</div><div class="v">–</div></button>`;
    }).join("");
    const last = m.days.slice(-1)[0][0];
    const ytdThen = D.months.filter((x) => x.m.startsWith(`${r.y}-`) && x.m <= r.m).reduce((t, x) => t + cents(x.pl), 0) / 100
      + (y.outside || []).filter((o) => o.d <= last).reduce((t, o) => t + o.pl, 0);
    const overallThen = (D.months.filter((x) => x.m <= r.m).reduce((t, x) => t + cents(x.pl), 0)
      + D.years.flatMap((x) => x.outside || []).filter((o) => o.d <= last).reduce((t, o) => t + cents(o.pl), 0)) / 100;
    const ups = m.days.filter((d) => d[1] > 0).length, downs = m.days.filter((d) => d[1] < 0).length;
    const first = dt(`${r.m}-01`).getUTCDay(), n = new Date(Date.UTC(+r.y, +r.m.slice(5), 0)).getUTCDate();
    const by = Object.fromEntries(m.days.map((d) => [+d[0].slice(8), d])), max = Math.max(1, ...m.days.map((d) => Math.abs(d[1])));
    let cal = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((h) => `<div class="h">${h}</div>`).join("") + `<div class="h wkh">Week</div>`;
    let week = 0, wdays = 0, col = 0;
    const flush = () => { cal += `<div class="wk"><div class="k">Week</div><div class="v ${tone(week)}">${money(week)}</div><div class="k">${wdays} day${wdays === 1 ? "" : "s"}</div></div>`; week = 0; wdays = 0; };
    for (let i = 0; i < first; i++, col++) cal += `<div class="d empty"></div>`;
    for (let i = 1; i <= n; i++) {
      const d = by[i];
      if (d) {
        week += d[1] + d[2]; wdays++;
        cal += `<div class="d has" role="button" tabindex="0" data-go="${href(r.y, r.m, d[0])}" style="background:${shade(d[1], max)}"><span class="n">${i}</span>
          <span class="v">${money(d[1])}</span><span class="x">${d[3]} bets${d[4] ? ` · +$${Math.round(d[4])} bonus` : ""}</span>${cents(d[2]) ? `<span class="adj">adj. ${money(d[2])}</span>` : ""}</div>`;
      } else cal += `<div class="d empty"><span class="n faint">${i}</span></div>`;
      if (++col % 7 === 0) flush();
    }
    if (col % 7) { for (; col % 7; col++) cal += `<div class="d empty"></div>`; flush(); }
    let run = 0;
    const pts = m.days.map((d) => ({ label: dayLong(d[0]), v: d[1] + d[2], go: href(r.y, r.m, d[0]), axis: (+d[0].slice(8) % 5 === 1 || m.days.length < 12) ? String(+d[0].slice(8)) : "", tip: `${d[3]} bets` }));
    const yb = Object.fromEntries(y.books.map((b) => [b[0], b[1]]));
    const used = new Set(m.books.map((b) => b[0]));
    const notUsed = y.books.filter((b) => !used.has(b[0]) && b[0] !== "N/A");
    const adjTotal = m.days.reduce((t, d) => t + cents(d[2]), 0) / 100;
    const html = `${steps(r)}<div class="mstrip">${strip}</div>
      <div class="hero"><div><div class="k">${esc(monthName(r.m))} P/L${m.full ? "" : " so far"}</div><div class="big ${tone(m.pl)}">${money(m.pl)}</div>
        <div class="sub">${m.days.length} days · ${ups} up · ${downs} down</div></div>
        <div class="side"><div class="kv small"><div class="k">${r.y} through ${MONTHS[+r.m.slice(5) - 1].slice(0, 3)}</div><div class="v ${tone(ytdThen)}">${money(ytdThen)}</div></div>
          <div class="kv small"><div class="k">Overall through ${mdy(last)}</div><div class="v ${tone(overallThen)}">${money(overallThen)}</div></div>
          <div class="split">Cash <b class="${tone(m.cash)}">${money(m.cash)}</b><br><span class="bonus">Bonus bets won <b>${money(m.bonus)}</b></span> <span class="muted">worth ${money(m.worth, { plain: true })} at ${esc(rateText(m.rates).replace(" value", ""))}</span></div></div></div>
      <div class="cal">${cal}</div>
      ${cents(adjTotal) ? `<div class="dnote">“adj.” under a day: ${money(adjTotal)} of the month post that isn't in one day's own number (a later correction), placed on the day it came from so the days add up to the month.</div>` : ""}
      <div class="panel"><div class="ph"><div><h3>Day by day · ${esc(monthName(r.m))}</h3><div class="s">click a day to open it</div></div></div><div data-chart-slot="days"></div></div>
      <div class="panel"><div class="ph"><div><h3>Sportsbooks · ${esc(monthName(r.m))}</h3><div class="s">the right column is each book's ${r.y}</div></div></div>
        ${booksTable(m.books, { head: MONTHS[+r.m.slice(5) - 1], second: { head: String(r.y), of: (c) => yb[c] !== undefined ? M(yb[c]) : "", total: M(y.pl) }, upLabel: "Up this month", downLabel: "Down this month" })}
        ${notUsed.length ? `<div class="dnote">Not used in ${MONTHS[+r.m.slice(5) - 1]}: ${notUsed.map((b) => `${esc(bookName(b[0]))} (${money(b[1])} in ${r.y})`).join(" · ")}</div>` : ""}</div>
      <details class="everyday"><summary>Every day · ${esc(monthName(r.m))} (${m.days.length})</summary><div class="dlist">${m.days.map((d) => `<button data-go="${href(r.y, r.m, d[0])}"><span>${dayShort(d[0])}</span><b class="${tone(d[1])}">${money(d[1])}</b></button>`).join("")}</div></details>`;
    loadMonth(r.m).catch(() => {});  // ready for a day
    return { html, charts: { days: barChart(pts, { line: true, h: 240, label: `${monthName(r.m)} by day` }) } };
  }

  function lineHtml(l) {
    const [cash, bonus, code, text] = l;
    const amt = cents(cash) ? money(cash, { trim: true }) : cents(bonus) ? "" : "$0";
    const sub = cents(bonus) ? (cents(cash) < 0 ? `↳ +$${bonus.toLocaleString("en-US")} back in bonus bets` : cents(cash) > 0 ? `↳ +$${bonus.toLocaleString("en-US")} in bonus bets` : "") : "";
    const main = !cents(cash) && cents(bonus) ? `<span class="bonus">+$${bonus.toLocaleString("en-US")}</span>` : `<span class="${tone(cash)}">${amt}</span>`;
    const c = bookColor(code);
    return `<div class="line"><span class="amt">${main}</span><span class="badge" style="background:${rgba(c, .16)};color:${c};border:1px solid ${rgba(c, .35)}">${esc(code === "NB" ? "—" : code)}</span>
      <span class="tx">${esc(text)}${!cents(cash) && cents(bonus) ? `<span class="sub" style="display:block">↳ paid in bonus bets</span>` : ""}</span>${sub ? `<span class="sub">${sub}</span>` : ""}</div>`;
  }
  function dayCard(day, row) {
    const order = D.order, idx = (c) => { const i = order.indexOf(c); return i < 0 ? 100 : i; };
    const groups = {};
    (day.lines || []).forEach((l, i) => (groups[l[2]] = groups[l[2]] || []).push([l, i]));
    const codes = Object.keys(groups).sort((a, b) => idx(a) - idx(b) || groups[a][0][1] - groups[b][0][1]);
    const sortIn = (g) => g.slice().sort((a, b) => { const k = (l) => (cents(l[0]) > 0 || (!cents(l[0]) && cents(l[1]) > 0) ? 0 : !cents(l[0]) ? 1 : 2); return k(a[0]) - k(b[0]) || a[1] - b[1]; });
    const lines = codes.map((c) => `<div class="grp">${sortIn(groups[c]).map(([l]) => lineHtml(l)).join("")}</div>`).join("");
    const pl = day.pl, won = cents(pl) >= 0;
    const cash = (day.lines || []).reduce((t, l) => t + cents(l[0]), 0) / 100, bonus = (day.lines || []).reduce((t, l) => t + cents(l[1]), 0) / 100;
    const paren = cents(bonus) ? ` <span class="paren">(${money(cash, { trim: true })}, <span class="bonus">${money(bonus, { trim: true })} bonus bets</span>)</span>` : "";
    const tiles = day.books.map((b) => `<div class="tile"><div class="t" style="color:${bookColor(b[0])}">${esc(b[0] === "N/A" ? "N/A (not tied to a book)" : `${bookName(b[0])} (${b[0]})`)}</div><div class="v ${tone(b[1])}">${money(b[1], { trim: true })}</div></div>`).join("");
    const nBooks = day.books.filter((b) => b[0] !== "N/A" && b[0] !== "NB").length;
    return `<div class="daycard${won ? "" : " neg"} fade">
      <div class="dc-top"><div><div class="dc-brand">BOOST WORLD <span>DAILY P/L</span></div><div class="dc-date">${mdy(day.d)}</div><div class="dc-wd">${WD[dt(day.d).getUTCDay()]}</div></div>
        <div class="dc-res"><div class="w ${won ? "up" : "down"}">${cents(pl) > 0 ? "WON" : cents(pl) < 0 ? "LOST" : "EVEN"}</div><div class="a ${tone(pl)}">${money(pl)}</div></div></div>
      <div class="chips"><span class="chip"><b>${day.bets}</b>bets</span><span class="chip"><b class="up">${day.won}</b>won</span><span class="chip"><b class="down">${day.lost}</b>lost</span><span class="chip"><b>${nBooks}</b>book${nBooks === 1 ? "" : "s"}</span></div>
      ${day.lines && day.lines.length ? `<div class="lines">${lines}</div>` : `<div class="dnote">This day is its posted total; its bets weren't listed one by one.</div>`}
      <div class="result ${tone(pl)}">= ${cents(pl) >= 0 ? "Won" : "Lost"} ${money(Math.abs(pl), { plain: true, trim: true })}${day.lines && day.lines.length ? paren : ""}</div>
      <div class="eyebrow" style="margin-bottom:8px">Each book today</div><div class="tiles">${tiles}</div>
      ${cents(row[2]) ? `<div class="dnote">adj. ${money(row[2])}: part of the month post placed on this day (a later correction), outside the day's own number.</div>` : ""}
      <div class="boxes"><div class="box${day.md < 0 ? " neg" : ""}"><div class="k">${MONTHS[+day.d.slice(5, 7) - 1]} P/L</div><div class="v ${tone(day.md)}">${money(day.md)}</div></div>
        <div class="box${day.od < 0 ? " neg" : ""}"><div class="k">Overall P/L since ${mdy(D.since)}</div><div class="v ${tone(day.od)}">${money(day.od)}</div></div></div>
      <div class="dc-foot">Bonus bets counted at ${pct(day.rate)} of their value</div></div>`;
  }
  function viewDay(r) {
    const m = monthOf(r.m), row = dayRow(r.d), max = Math.max(1, ...m.days.map((d) => Math.abs(d[1])));
    const n = new Date(Date.UTC(+r.y, +r.m.slice(5), 0)).getUTCDate(), by = Object.fromEntries(m.days.map((d) => [+d[0].slice(8), d]));
    let strip = "";
    for (let i = 1; i <= n; i++) {
      const d = by[i];
      strip += d ? `<button class="${d[0] === r.d ? "on" : ""}" style="background:${shade(d[1], max)}" data-go="${href(r.y, r.m, d[0])}" data-tip="${esc(`${dayShort(d[0])}<br><b class='${tone(d[1])}'>${money(d[1])}</b>`)}">${i}</button>`
        : `<button class="none" disabled>${i}</button>`;
    }
    const html = `${steps(r)}<div class="dstrip">${strip}</div><div id="daycard"><div class="loading">Loading ${esc(dayLong(r.d))}…</div></div>`;
    loadMonth(r.m).then((md) => {
      const day = md.days.find((d) => d.d === r.d), slot = document.getElementById("daycard");
      if (!slot || route().d !== r.d) return;
      slot.innerHTML = day ? dayCard(day, row) : `<div class="dnote">This day couldn't be loaded.</div>`;
      sendHeight();
    }).catch(() => { const slot = document.getElementById("daycard"); if (slot) slot.innerHTML = `<div class="dnote">This day couldn't be loaded. Try again in a moment.</div>`; });
    return { html, charts: {} };
  }

  // ---------------------------------------------------------------- render + events
  let lastLevelKey = null, climbEl = null;
  const climbSlot = document.createElement("div");
  climbSlot.id = "climb-slot";
  app.parentNode.insertBefore(climbSlot, app);
  function render() {
    if (!D) return;
    const r = route();
    const v = r.level === "all" ? viewAll() : r.level === "year" ? viewYear(r) : r.level === "month" ? viewMonth(r) : viewDay(r);
    // the climb stays above every view (user, Nov 1: "I want the chart to stay above ... Don't minimize the graph when they click
    // on a month"): made once, its focus redrawn
    if (!climbEl) { climbEl = climbChart(); climbSlot.appendChild(climbEl); }
    climbEl._focus = { y: r.y, m: r.m };
    climbEl._draw();
    app.innerHTML = `${header(r)}<div class="fade">${v.html}</div>`;  // (no footer line: user, Nov 1, "we can just remove all that info there")
    mountCharts(v.charts);
    attachTip(app);
    const key = `${r.level}:${r.y}:${r.m}:${r.d}`;
    if (lastLevelKey !== null && key !== lastLevelKey) {
      // to the view under the chart ("take them down to ... the calendar ... but actually leave the graph still above"): the frame
      // gets how far down this page it starts (offset); boostworld.us scrolls to it
      if (embedded) parent.postMessage({ type: "boostworld-pl-top", offset: Math.round(app.getBoundingClientRect().top + window.scrollY) }, "*");
      else app.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    lastLevelKey = key;
    tipEl.classList.remove("on");
    sendHeight();
  }
  app.addEventListener("click", (e) => {
    const yc = e.target.closest("[data-year]");
    if (yc) { openYear = openYear === +yc.dataset.year ? null : +yc.dataset.year; render(); return; }
    const more = e.target.closest("tr.row[data-book]");
    if (more) { const x = app.querySelector(`tr.more[data-more="${CSS.escape(more.dataset.book)}"]`); if (x) { x.hidden = !x.hidden; sendHeight(); } return; }
    const t = e.target.closest("[data-go]");
    if (t && t.dataset.go) { e.preventDefault(); go(t.dataset.go); }
  });
  app.addEventListener("change", (e) => {
    if (e.target.matches("[data-pick]") && e.target.value) go(e.target.value);
  });
  app.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[role=button][data-go]")) { e.preventDefault(); go(e.target.dataset.go); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    const r = route();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const b = app.querySelector(`.step[data-step="${e.key === "ArrowLeft" ? "prev" : "next"}"]`);
      if (b) { e.preventDefault(); go(b.dataset.go); }
    } else if (e.key === "Escape") {
      const up = r.level === "day" ? href(r.y, r.m) : r.level === "month" ? href(r.y) : r.level === "year" ? "#/" : null;
      if (up) { e.preventDefault(); go(up); }
    }
  });
  window.addEventListener("hashchange", render);
  let rz = null;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { app.querySelectorAll("[data-chart]").forEach((c) => c._draw()); if (climbEl) climbEl._draw(); sendHeight(); }, 120); });

  // the frame's height follows the page (Base44 listens for "boostworld-pl-height")
  let lastH = 0;
  function sendHeight() {
    if (!embedded) return;
    requestAnimationFrame(() => {
      // the content's own height (Nov 1: documentElement.scrollHeight is never less than the frame itself, so the frame stayed
      // at its starting 1,800 px with a big empty gap under the page)
      const wrap = document.querySelector(".wrap");
      const h = Math.ceil(wrap ? wrap.getBoundingClientRect().bottom + window.scrollY : document.body.scrollHeight);
      if (Math.abs(h - lastH) > 2) { lastH = h; parent.postMessage({ type: "boostworld-pl-height", height: h }, "*"); }
    });
  }
  if (embedded && "ResizeObserver" in window) new ResizeObserver(sendHeight).observe(document.querySelector(".wrap") || document.body);
  document.addEventListener("toggle", sendHeight, true);

  (window.__PL ? Promise.resolve(window.__PL) : fetch("data/pl.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }))
    .then((d) => { D = d; render(); })
    .catch(() => { app.innerHTML = `<div class="loading">The P/L couldn't be loaded. Refresh in a moment.</div>`; sendHeight(); });
})();
