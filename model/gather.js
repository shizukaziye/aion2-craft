// What one gather is worth. Pure: no DOM access.
// gather: data/gathering.json  {materials: {name: {tiers: [[item name, share of gathers], ...], gathers, items}}}
// prices: {key: {name, cat, p, n, last, med7}}   keep: share of a sale left after tax and listing fee

// Materials only one faction can gather (Nezekan vs Israphel listings, Nov 2026). The rest grow on both sides.
const ELYOS = ['Yggdrasil Log', 'Aria', 'Targena', 'Coriolus', 'Kukuru', 'Mela', 'Inina', 'Cypri'];
const ASMODIAN = ['Asvata Log', 'Azpha', 'Calendula', 'Morfa', 'Ohkra', 'Raydam', 'Conide', 'Pujery'];

export function gatherRows(gather, prices, faction, keep = 1) {
  const byName = {};
  for (const v of Object.values(prices)) if (v.cat === 'Gathered resources') byName[v.name] = v;
  const other = faction === 'Elyos' ? ASMODIAN : faction === 'Asmodian' ? ELYOS : [];
  const rows = [];
  for (const [name, m] of Object.entries(gather.materials)) {
    if (other.includes(name)) continue;
    const success = m.tiers.reduce((s, t) => s + t[1], 0);
    const ipg = m.items / m.gathers;
    const perSuccess = ipg / success;   // items per successful gather, taken as the same in every tier
    const tiers = m.tiers.map(([item, share]) => {
      const v = byName[item] || {};
      const stale = v.p == null;        // nothing listed: fall back to the last ask seen
      const price = stale ? v.last ?? null : v.p;
      const med7 = v.med7 ?? null;
      const w = share * perSuccess * keep;
      return { item, share, price, stale, n: v.n || 0, med7, now: price == null ? null : w * price, med: med7 == null ? null : w * med7 };
    });
    const sum = f => tiers.some(t => t[f] == null) ? null : tiers.reduce((s, t) => s + t[f], 0);
    rows.push({ name, ipg, perSuccess, tiers, now: sum('now'), med: sum('med') });
  }
  return rows;
}
