# Wishlist

**Every wishlist, in one place.** A self-hosted shopping wishlist that looks and feels like an iOS app. Paste a link to any product and Wishlist saves it as a tidy card with the photo, price, brand and store. Tap the card to jump straight to the store.

Think [Karakeep](https://karakeep.app), but built for shopping — so you can stop keeping wishlists on Amazon, Etsy, and a dozen store apps.

## Features

- **Paste a link → get a product card.** Reads schema.org product data, Open Graph tags, Shopify's product JSON and Amazon pages. Photos are downloaded to your server so they never break.
- **Multiple lists with live totals.** Each list shows its total, what's left to buy and what you've already purchased. Smart lists for *All Items*, *Favorites*, *Price Drops* and *Purchased*.
- **Auto-tagging.** Items are sorted into categories (Electronics, Shoes, Home, Beauty, …) automatically, plus your own keyword rules.
- **Price-drop tracking.** Prices are re-checked in the background, with a history chart and a green badge when something gets cheaper.
- **Currency & units.** Totals are converted to your currency with daily exchange rates. Weights and sizes are shown in imperial or metric.
- **Light, dark or automatic,** with 12 accent colours.
- **Users & live sync.** Every person gets their own private lists. Changes appear instantly on every signed-in device.
- **Share a list.** Create a read-only public link to send to family before birthdays.
- **Add from anywhere.** Use the iPhone share sheet via Shortcuts, the Android share sheet, a desktop bookmarklet, or just paste a link anywhere in the app.
- **Installable PWA** with offline access to your lists.
- **Export & import** everything as JSON.

## Quick start

```bash
docker run -d --name wishlist -p 8080:8080 -v ./data:/data ghcr.io/brandxn-dp/wishlist:latest
```

Open `http://your-server:8080`. The first account you create becomes the admin.

Or with Docker Compose (includes the optional headless Chrome — see below):

```bash
curl -O https://raw.githubusercontent.com/brandxn-dp/wishlist/main/docker-compose.yml
docker compose up -d
```

## Unraid

### Option A — Docker template (recommended)

1. In the Unraid web UI open a terminal (**>_** icon, top right) and download the template:
   ```bash
   wget -O /boot/config/plugins/dockerMan/templates-user/my-wishlist.xml https://raw.githubusercontent.com/brandxn-dp/wishlist/main/unraid/wishlist.xml
   ```
2. Go to **Docker → Add Container**, and pick **wishlist** from the **Template** dropdown.
3. Check the port (default `8080`) and the data path (`/mnt/user/appdata/wishlist`), then click **Apply**.
4. Click the Wishlist icon → **WebUI**, and create your admin account.

### Option B — Docker Compose Manager plugin

Install **Docker Compose Manager** from Community Apps, add a new stack, paste in [`docker-compose.yml`](docker-compose.yml), change `./data` to `/mnt/user/appdata/wishlist`, then click **Compose Up**.

### Optional: headless Chrome for difficult stores

Some stores (Target, Best Buy, B&H, Etsy, Walmart…) block simple server requests or build their pages with JavaScript. A headless Chrome container lets Wishlist read those pages like a real browser does.

1. In the terminal, create a private network: `docker network create wishlist`
2. Download the Chrome template:
   ```bash
   wget -O /boot/config/plugins/dockerMan/templates-user/my-wishlist-chrome.xml https://raw.githubusercontent.com/brandxn-dp/wishlist/main/unraid/wishlist-chrome.xml
   ```
3. **Add Container** → template **wishlist-chrome** → **Apply**. It's already set to use the `wishlist` network. Don't add a port for it.
4. Edit the **wishlist** container: set **Network Type** to **Custom: wishlist**. Set **Headless browser URL** to `http://wishlist-chrome:9222`. Click **Apply**.
5. **Settings → About → Headless Browser** in the app should now say **Connected**.

> If you don't see "Custom: wishlist" in the Network Type list, enable **Settings → Docker → Preserve user defined networks** (Docker must be stopped to change it).

### Updating

**Docker** tab → **Check for Updates**, then **Apply Update** on Wishlist. Your data lives in `/mnt/user/appdata/wishlist`.

## Using it on your iPhone

1. Open your Wishlist URL in **Safari** → **Share** → **Add to Home Screen**.
2. For the share sheet: **Settings → iPhone Shortcut, Bookmarklet & API** in the app walks you through a 1-minute Shortcut. It can send the page's HTML from your phone, which works even with stores that block servers.

> **HTTPS:** Installing works over plain `http://` on your LAN. Offline mode, clipboard paste and the Android share target need HTTPS, though. For access away from home, put Wishlist behind a reverse proxy (Nginx Proxy Manager, SWAG) or use Tailscale.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `/data` | Where the SQLite database and images are stored |
| `PRICE_CHECK_HOURS` | `24` | Background price-check interval. `0` disables |
| `BROWSER_URL` | – | Chrome DevTools HTTP endpoint, e.g. `http://wishlist-chrome:9222` |
| `BROWSER_WS_URL` | – | Alternative: a direct WebSocket endpoint (e.g. browserless) |
| `ALLOW_SIGNUP` | `false` | Allow self sign-up after the first (admin) account. Can also be toggled in Settings |
| `DISABLE_SIGNUP` | `false` | Force sign-ups off regardless of the Settings toggle |
| `ALLOW_PRIVATE_URLS` | `false` | Allow fetching links on private/LAN addresses |

## API

Create a token in **Settings → iPhone Shortcut, Bookmarklet & API**, then:

```bash
curl -X POST http://your-server:8080/api/items \
  -H "Authorization: Bearer wl_…" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.example.com/products/thing", "listId": "optional"}'
```

Add `"html": "<!doctype html>…"` to skip the server-side fetch and parse HTML you captured yourself.

## Development

```bash
npm install
npm run dev:server   # API on :8080
npm run dev:web      # Vite on :5173 with hot reload (proxies /api)
```

Built with Node 22 (built-in SQLite), Express, Cheerio and React. No native dependencies.

## License

MIT
