# Aion 2 Craft Market

Which recipes pay, on your server, right now. Live at https://shizukaziye.github.io/aion2-craft/

- Recipes and icons: the gamers4.life crafting graph (1,466 items, 2,442 recipes).
- Prices: aion2.exchange cheapest listings per server, plus the 28-day sales statistics the game publishes for materials and consumables.
- Cleared bands: for gear and accessories the game publishes no sales, so the bake infers what cleared from listings that vanished between 10-minute snapshots.

`tools/fetch_data.py` bakes everything into `data/` and runs hourly from GitHub Actions. Add server ids to `data/config.json` to track more servers; `history_servers` gets the cleared-band bake, which costs one request per recipe-relevant item.

Static page, no build step: `index.html`, `styles.css`, `app.js`, `model/craft.js`.

## Alerts

After each hourly bake, `tools/alerts.mjs` runs the same model as the page over the configured server and fires:

- **recipe** alerts when a craft clears the profit, ROI, cleared-count and listing minimums in `data/alerts_config.json` on the conservative basis;
- **buy** alerts when a watched input's cheapest ask drops under its line;
- **sell** alerts when a watched output has a vanished ask over its line.

New alerts are de-duplicated with a cooldown (`cooldown_hours`) unless the number improves by `improve_pct`. They are written to `data/alerts.json` and `data/alerts_log.json` (shown on the page's Alerts tab), commented on the repo's rolling **Market alerts** issue so GitHub notifies you, and posted to Discord if a `DISCORD_WEBHOOK` repository secret is set (Settings → Secrets and variables → Actions). Edit the watch list and thresholds in `data/alerts_config.json`.
