# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

**ff14-booking** is a static HTML/JS booking site for the FF14 RP board-game shop 「光之意志」(Will of Light). There is no build step, package manager, or backend in this repo. Data is served by an external Google Apps Script (GAS) Web App configured in `config.js`.

### Services

| Service | Required? | How to run |
|---------|-----------|------------|
| Static HTTP server | **Yes** | `python3 -m http.server 8000` from repo root |
| GAS API (external) | **Yes** (for live data) | URL in `config.js`; needs network access |
| Tailwind / Google Fonts CDNs | UI only | Loaded by `index.html` over the network |

### Dev URLs

- Player frontend: http://localhost:8000/index.html
- Admin panel: http://localhost:8000/admin.html
- Legacy redirect: http://localhost:8000/adim.html

### Lint / test / build

This repo has **no** `package.json`, linter config, test runner, or build pipeline. Verification is manual:

1. Start the static server (see above).
2. Confirm `index.html` and `admin.html` return HTTP 200.
3. Open the player frontend and confirm time slots load (not an infinite spinner).
4. Open the admin panel and confirm pending bookings / active slots appear.

### Gotchas

- **No local data file**: `data.json` is a schema placeholder only; the app reads from GAS via JSONP.
- **GAS redirects**: `curl` against the API must use `-L` to follow redirects; browsers handle this automatically.
- **Write operations use `no-cors` POST**: the browser cannot read success/failure responses for inserts/updates/deletes; re-fetch data to verify writes.
- **Admin has no auth**: anyone with the admin URL can manage slots and bookings.
- **CDN dependency**: `index.html` pulls Tailwind and fonts from CDNs; offline dev will show unstyled or partially styled UI.
