import { DEFAULTS, evaluate, tree, itemName, maxTrade, isCapped } from './model/craft.js?v=3';

const $ = id => document.getElementById(id);
let GRAPH = null, SERVERS = null, META = null, PRICES = {}, HISTORY = {}, P = { ...DEFAULTS }, RESULT = null, SELECTED = null;
let sortKey = 'ppm', sortDir = -1;

const fmt = n => n == null || isNaN(n) ? '–' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString();
const pct = n => n == null || isNaN(n) ? '–' : (n * 100).toFixed(0) + '%';
const cls = n => n > 0 ? 'good' : n < 0 ? 'bad' : '';
const icon = k => { const it = GRAPH.items[k]; return it && it.icon ? `<img class="ic" src="${it.icon}" referrerpolicy="no-referrer" loading="lazy" alt="">` : '<span class="ic"></span>'; };
const nm = k => itemName(GRAPH, PRICES, k);

window.toggleInputs = () => { const d = $('inputs'); const open = d.style.display === 'none'; d.style.display = open ? '' : 'none'; $('togArrow').textContent = open ? '▾' : '▸'; };
window.setTab = t => { for (const s of document.querySelectorAll('.tab')) s.classList.toggle('on', s.id === t); for (const b of document.querySelectorAll('.tabs .mbtn')) b.classList.toggle('on', b.id === 'tab-' + t); };

function setDefaultsToInputs() {
  for (const k of Object.keys(DEFAULTS)) { const el = $(k); if (el) el.value = DEFAULTS[k]; }
}
function readParams() {
  const num = (id, d) => { const v = parseFloat($(id).value); return isNaN(v) ? d : v; };
  P = {
    server: parseInt($('server').value, 10) || DEFAULTS.server,
    profession: $('profession').value,
    maxMastery: num('maxMastery', DEFAULTS.maxMastery),
    priceBasis: $('priceBasis').value,
    greenMult: Math.max(0.01, num('greenMult', 100) / 100),
    tax: Math.min(0.9, Math.max(0, num('tax', 10) / 100)),
    listFee: Math.min(0.5, Math.max(0, num('listFee', 2) / 100)),
    rsOverride: Math.max(0, num('rsOverride', 0)),
    minPerCraft: Math.max(0.1, num('minPerCraft', 1)),
    budget: Math.max(0, num('budget', 0)),
    succLow: num('succLow', 96) / 100, succMid: num('succMid', 80) / 100, succHigh: num('succHigh', 70) / 100, succTop: num('succTop', 60) / 100,
    askCap: Math.max(0, num('askCap', 20) / 100),
  };
}
window.resetDefaults = () => { setDefaultsToInputs(); recalc(); };

async function loadServerData(server) {
  $('status').textContent = 'loading prices…';
  try {
    const d = await (await fetch(`data/prices_${server}.json`, { cache: 'no-cache' })).json();
    PRICES = d.prices || {}; HISTORY = d.history || {};
    $('status').textContent = `${Object.keys(PRICES).length} items, ${Object.keys(HISTORY).length} with cleared bands, baked ${d.baked_at}`;
  } catch (e) {
    PRICES = {}; HISTORY = {};
    $('status').textContent = `no baked prices for server ${server} — add it to data/config.json`;
  }
}

window.recalc = async () => {
  const prev = P.server; readParams();
  if (P.server !== prev || !Object.keys(PRICES).length) await loadServerData(P.server);
  RESULT = evaluate(GRAPH, PRICES, HISTORY, P);
  renderOpps(); renderMarket(); if (SELECTED) renderRecipe(SELECTED);
};

const COLS = [
  ['name', 'Recipe', false], ['ml', 'ml', true], ['ppm', 'kina/min', true], ['profit', 'profit/craft', true], ['roi', 'ROI', true],
  ['cost', 'cost', true], ['ev', 'EV', true], ['mins', 'min', true], ['crafts', 'crafts @budget', true],
  ['plain', 'plain ask', true], ['plainL', 'L', true], ['green', 'Splendent ask', true], ['greenL', 'sL', true], ['maxTrade', 'max trade', true], ['band', 'cleared band', false], ['breakEvenGreen', 'break-even Splendent', true],
];
window.sortBy = k => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = -1; } renderOpps(); };

window.renderOpps = () => {
  if (!RESULT) return;
  const q = $('oppSearch').value.trim().toLowerCase();
  let rows = RESULT.rows.filter(r => !q || r.name.toLowerCase().includes(q));
  if ($('onlyPositive').checked) rows = rows.filter(r => r.profit > 0);
  if ($('onlyListed').checked) rows = rows.filter(r => r.plainL > 0 || r.greenL > 0);
  const minGone = parseInt($('minGone').value, 10) || 0;
  if (minGone > 0 && Object.keys(HISTORY).length) rows = rows.filter(r => (r.hist && r.hist.gone >= minGone));
  rows.sort((a, b) => { const x = a[sortKey], y = b[sortKey]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
  $('oppCount').textContent = `${rows.length} recipes`;
  const head = '<tr>' + COLS.map(([k, l, n]) => `<th class="${n ? 'num' : ''}" onclick="sortBy('${k}')">${l}${sortKey === k ? (sortDir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('') + '</tr>';
  const body = rows.slice(0, 400).map(r => {
    const h = r.hist, band = h && h.lo ? `${fmt(h.lo)}–${fmt(h.hi)} <span class="dim">(${h.gone} gone/${h.hours}h)</span>` : h ? `<span class="dim">${h.gone} gone/${h.hours}h</span>` : '';
    return `<tr class="click ${SELECTED === r.rid ? 'sel' : ''}" onclick="pick('${r.rid}')">
      <td><span class="name">${icon(r.out)}${r.name}</span><span class="pill">${r.prof}</span>${r.combo ? `<span class="pill">→ ${nm(r.combo)}</span>` : ''}</td>
      <td class="num">${r.ml}</td><td class="num ${cls(r.ppm)}">${fmt(r.ppm)}</td><td class="num ${cls(r.profit)}">${fmt(r.profit)}</td><td class="num ${cls(r.roi)}">${pct(r.roi)}</td>
      <td class="num">${fmt(r.cost)}</td><td class="num">${fmt(r.ev)}</td><td class="num">${r.mins.toFixed(1)}</td><td class="num">${r.crafts}</td>
      <td class="num">${fmt(r.plain)}</td><td class="num dim">${r.plainL}</td><td class="num">${fmt(r.green)}${r.capped ? ' <span class="pill bad" title="ask is more than the cap above the highest known trade; valued at the trade">capped</span>' : ''}</td><td class="num dim">${r.greenL}</td><td class="num">${fmt(r.maxTrade)}</td><td>${band}</td><td class="num">${fmt(r.breakEvenGreen)}</td></tr>`;
  }).join('');
  $('oppTable').innerHTML = head + body;
};

window.pick = rid => { SELECTED = rid; renderRecipe(rid); setTab('recipe'); renderOpps(); };

function treeHtml(t) {
  if (!t) return '<span class="bad">cannot be priced</span>';
  return '<ul>' + t.lines.map(l => `<li><span class="name">${icon(l.key)}${l.qty} × ${nm(l.key)}</span> <span class="accent">@ ${fmt(l.unit)}</span><span class="how">${l.how}${l.mins ? ` · ${l.mins.toFixed(1)} min` : ''}</span>${l.sub ? treeHtml(l.sub) : ''}</li>`).join('') + '</ul>';
}

function mktRow(k) {
  const v = PRICES[k]; if (!v) return `<div class="kv"><div>${nm(k)}</div><div class="dim">not on market</div></div>`;
  const h = HISTORY[k];
  return `<div class="kv">
    <div>ask</div><div>${fmt(v.p)} <span class="dim">(${v.n} listings)</span></div>
    <div>28d sold</div><div>${v.sold ? `${v.sold.toLocaleString()} @ avg ${fmt(v.avg)} (${fmt(v.smin)}–${fmt(v.smax)})` : '<span class="dim">not published for this item</span>'}</div>
    <div>cleared band</div><div>${h ? (h.lo ? `${fmt(h.lo)}–${fmt(h.hi)}` : '<span class="dim">no priced event</span>') + ` <span class="dim">· ${h.gone} listings gone in ${h.hours}h · 24h range ${fmt(h.low24)}–${fmt(h.high24)}</span>` : '<span class="dim">no history baked</span>'}</div>
    <div>highest trade</div><div>${fmt(maxTrade(k, RESULT.ctx))}${isCapped(k, RESULT.ctx) ? ' <span class="pill bad">ask capped</span>' : ''}</div>
  </div>`;
}

function renderRecipe(rid) {
  if (!RESULT) return;
  const r = RESULT.rows.find(x => x.rid === rid) || null;
  const rec = GRAPH.recipes[rid];
  const t = tree(rid, RESULT.ctx);
  const out = String(rec.out), combo = rec.combo ? String(rec.combo) : null;
  const s = r ? r.s : null;
  $('recipeDetail').innerHTML = `
    <h2 style="margin-top:0"><span class="name">${icon(out).replace('class="ic"', 'class="ic big"')}${nm(out)}</span> <span class="pill">${rec.p} · mastery ${rec.ml}</span></h2>
    ${combo ? `<div class="small">combo ${(rec.cp / 100).toFixed(0)}% → <span class="name">${icon(combo)}${nm(combo)}</span></div>` : ''}
    ${r ? `<div class="kv">
      <div>cost per craft</div><div>${fmt(r.cost)} <span class="dim">(fee ${fmt(rec.gold || 0)})</span></div>
      <div>expected value</div><div>${fmt(r.ev)} <span class="dim">at ${pct(s)} success, tax ${pct(P.tax)} + fee ${pct(P.listFee)}</span></div>
      <div>profit per craft</div><div class="${cls(r.profit)}">${fmt(r.profit)} <span class="dim">(${pct(r.roi)} ROI)</span></div>
      <div>profit per minute</div><div class="${cls(r.ppm)}">${fmt(r.ppm)} <span class="dim">(${r.mins.toFixed(1)} min incl. own-crafted inputs)</span></div>
      ${combo ? `<div>break-even Splendent</div><div>${fmt(r.breakEvenGreen)}</div>` : ''}
      <div>crafts with budget</div><div>${r.crafts} <span class="dim">(${fmt(r.crafts * r.profit)} expected)</span></div>
    </div>` : '<div class="bad">Output not priced on this server.</div>'}
    <h2>Inputs (cheapest route)</h2><div class="tree">${treeHtml(t)}</div>`;
  $('recipeMarket').innerHTML = `<h2 style="margin-top:0">Output market</h2><b>${nm(out)}</b>${mktRow(out)}${combo ? `<b>${nm(combo)}</b>${mktRow(combo)}` : ''}
    <h2>Input market</h2>${rec.in.map(i => `<b class="name">${icon(String(i[0]))}${nm(String(i[0]))}</b>${mktRow(String(i[0]))}`).join('')}`;
}

window.recipeSuggest = () => {
  const q = $('recipeSearch').value.trim().toLowerCase();
  if (!q || !RESULT) { $('recipeSuggestions').innerHTML = ''; return; }
  const hits = RESULT.rows.filter(r => r.name.toLowerCase().includes(q)).slice(0, 12);
  $('recipeSuggestions').innerHTML = hits.map(r => `<button class="mbtn" onclick="pick('${r.rid}')">${r.name} <span class="dim">ml${r.ml}</span></button>`).join(' ');
};

window.renderMarket = () => {
  const q = $('mktSearch').value.trim().toLowerCase(), sec = $('mktSection').value;
  const rows = Object.entries(PRICES).filter(([k, v]) => (!q || v.name.toLowerCase().includes(q)) && (!sec || v.sec === sec));
  rows.sort((a, b) => ((b[1].sold || 0) * (b[1].avg || b[1].p || 0)) - ((a[1].sold || 0) * (a[1].avg || a[1].p || 0)) || (b[1].p || 0) - (a[1].p || 0));
  $('mktCount').textContent = `${rows.length} items`;
  const craftable = new Set([...RESULT.ctx.byOut.keys(), ...RESULT.ctx.byCombo.keys()]);
  $('mktTable').innerHTML = '<tr><th>Item</th><th>category</th><th class="num">ask</th><th class="num">L</th><th class="num">24h chg</th><th class="num">28d sold</th><th class="num">avg sale</th><th>cleared band</th><th>craft</th></tr>' +
    rows.slice(0, 600).map(([k, v]) => { const h = HISTORY[k]; return `<tr><td><span class="name">${icon(k)}${v.name}</span></td><td class="dim">${v.cat}</td><td class="num">${fmt(v.p)}</td><td class="num dim">${v.n}</td><td class="num ${cls(v.chg)}">${v.chg == null ? '–' : v.chg.toFixed(0) + '%'}</td><td class="num">${v.sold ? v.sold.toLocaleString() : '<span class="dim">–</span>'}</td><td class="num">${fmt(v.avg)}</td><td>${h && h.lo ? `${fmt(h.lo)}–${fmt(h.hi)} <span class="dim">(${h.gone}/${h.hours}h)</span>` : h ? `<span class="dim">${h.gone} gone/${h.hours}h</span>` : ''}</td><td>${craftable.has(k) ? `<button class="mbtn" onclick="pick('${RESULT.ctx.byOut.get(k) || RESULT.ctx.byCombo.get(k)}')">recipe</button>` : ''}</td></tr>`; }).join('');
};

async function init() {
  [GRAPH, SERVERS, META] = await Promise.all([
    fetch('data/graph.json').then(r => r.json()),
    fetch('data/servers.json').then(r => r.json()).catch(() => ({ servers: [] })),
    fetch('data/meta.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ servers: {} })),
  ]);
  const baked = new Set(Object.keys(META.servers || {}));
  const opts = (SERVERS.servers || []).filter(s => baked.has(String(s.server_id)))
    .map(s => `<option value="${s.server_id}">${s.name} (${s.region} ${s.faction})${META.servers[String(s.server_id)].has_sales ? ' · sales stats' : ''}</option>`);
  $('server').innerHTML = opts.join('') || `<option value="${DEFAULTS.server}">${DEFAULTS.server}</option>`;
  const secs = new Set();
  setDefaultsToInputs();
  if (!baked.has(String(DEFAULTS.server)) && baked.size) $('server').value = [...baked][0];
  $('meta').textContent = META.baked_at ? `data baked ${META.baked_at.replace('T', ' ').slice(0, 16)} UTC` : '';
  await loadServerData(parseInt($('server').value, 10));
  for (const v of Object.values(PRICES)) secs.add(v.sec);
  $('mktSection').innerHTML = '<option value="">all sections</option>' + [...secs].sort().map(s => `<option value="${s}">${s}</option>`).join('');
  await recalc();
}
init();
