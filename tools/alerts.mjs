// Market alert pass. Runs after the bake, uses the same model as the site.
//   node tools/alerts.mjs            -> writes data/alerts.json, data/alerts_state.json, data/alerts_new.md (if any new)
// Env: DISCORD_WEBHOOK (optional) posts new alerts to Discord.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluate, maxTrade } from '../model/craft.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const rd = f => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const cfg = rd('alerts_config.json');
const graph = rd('graph.json');
const priceFile = rd(`prices_${cfg.server}.json`);
const prices = priceFile.prices || {}, history = priceFile.history || {};
const servers = existsSync(join(DATA, 'servers.json')) ? rd('servers.json').servers : [];
const serverName = (servers.find(s => s.server_id === cfg.server) || {}).name || cfg.server;
const state = existsSync(join(DATA, 'alerts_state.json')) ? rd('alerts_state.json') : {};
const now = new Date();
const fmt = n => n == null ? '–' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString();

const P = { ...cfg.model };
const { rows, ctx } = evaluate(graph, prices, history, P);

const alerts = [];
// 1. recipe alerts: profitable on the conservative basis with cleared evidence
const ra = cfg.recipe_alerts;
for (const r of rows) {
  const gone = r.hist ? r.hist.gone || 0 : 0;
  if (!Number.isFinite(r.profit) || r.profit < ra.min_profit || r.roi < ra.min_roi || gone < ra.min_gone || r.cost > ra.max_cost) continue;
  if ((r.plainL || 0) + (r.greenL || 0) < ra.min_listings_out) continue;
  alerts.push({
    key: `recipe:${r.rid}`, type: 'recipe', title: r.name, value: r.profit,
    text: `${r.name} (${r.prof} ${r.ml}): +${fmt(r.profit)} per craft, ${Math.round(r.roi * 100)}% ROI, cost ${fmt(r.cost)}, ${gone} cleared in ${r.hist.hours}h, Splendent ${fmt(r.green)} (${r.greenL} listed), break-even ${fmt(r.breakEvenGreen)}`,
  });
}
// 2. watchlist: input dips and output spikes
const byName = {};
for (const [k, v] of Object.entries(prices)) byName[v.name] = k;
for (const w of cfg.watch) {
  const k = byName[w.item]; if (!k) continue;
  const v = prices[k], h = history[k] || {};
  if (w.below && v.p != null && v.p <= w.below) {
    alerts.push({ key: `below:${k}`, type: 'buy', title: w.item, value: -v.p,
      text: `${w.item} ask ${fmt(v.p)} (${v.n} listed), under your ${fmt(w.below)} line. Cleared ${fmt(h.lo)}–${fmt(h.hi)}, ${h.gone || 0} gone in ${h.hours || 0}h.${w.note ? ' ' + w.note : ''}` });
  }
  if (w.above && h.tmax && h.tmax >= w.above) { // only vanished asks count as evidence of a sale price
    alerts.push({ key: `above:${k}`, type: 'sell', title: w.item, value: h.tmax,
      text: `${w.item} cleared at ${fmt(h.tmax)} in the last ${h.hours}h (ask now ${fmt(v.p)}, ${v.n} listed), over your ${fmt(w.above)} line.${w.note ? ' ' + w.note : ''}` });
  }
}

// de-dupe: re-alert only after the cooldown or when the number improved by improve_pct
const fresh = [];
for (const a of alerts) {
  const prev = state[a.key];
  const improved = prev && Math.abs(a.value) >= Math.abs(prev.value) * (1 + cfg.improve_pct);
  const cold = !prev || (now - new Date(prev.at)) / 36e5 >= cfg.cooldown_hours;
  if (!prev || cold || improved) { fresh.push(a); state[a.key] = { at: now.toISOString(), value: a.value }; }
}
// drop stale state entries so an alert that went away can fire again later
for (const k of Object.keys(state)) if (!alerts.find(a => a.key === k) && (now - new Date(state[k].at)) / 36e5 >= cfg.cooldown_hours) delete state[k];

writeFileSync(join(DATA, 'alerts.json'), JSON.stringify({ at: now.toISOString(), server: cfg.server, serverName, baked_at: priceFile.baked_at, current: alerts, fresh }, null, 1));
writeFileSync(join(DATA, 'alerts_state.json'), JSON.stringify(state, null, 1));
const log = existsSync(join(DATA, 'alerts_log.json')) ? rd('alerts_log.json') : [];
for (const a of fresh) log.push({ at: now.toISOString(), ...a });
writeFileSync(join(DATA, 'alerts_log.json'), JSON.stringify(log.slice(-500), null, 1));

const head = `**${serverName}** · data ${priceFile.baked_at} · ${alerts.length} active, ${fresh.length} new`;
if (fresh.length) {
  const md = [head, '', ...fresh.map(a => `- **${a.type.toUpperCase()}** ${a.text}`), '', `https://shizukaziye.github.io/aion2-craft/#alerts`].join('\n');
  writeFileSync(join(DATA, 'alerts_new.md'), md);
  console.log(md);
  if (process.env.DISCORD_WEBHOOK) {
    const res = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: md.slice(0, 1900) }) });
    console.log('discord', res.status);
  }
} else {
  if (existsSync(join(DATA, 'alerts_new.md'))) writeFileSync(join(DATA, 'alerts_new.md'), '');
  console.log(head + ' (nothing new)');
}
