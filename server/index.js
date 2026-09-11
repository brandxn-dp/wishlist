import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { get, all, run, tx, id, now, kvGet, kvSet, IMAGE_DIR } from './db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, setSessionCookie, clearSessionCookie,
  requireAuth, requireAdmin, loginLimiter,
} from './auth.js';
import { subscribe, emit } from './events.js';
import { getRates } from './rates.js';
import { scrapeProduct, downloadImage, deleteImage, cleanUrl, browserMode } from './scraper.js';
import { autoTags, BUILT_IN_TAGS } from './tagger.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const PORT = Number(process.env.PORT || 8080);
const PRICE_CHECK_HOURS = Number(process.env.PRICE_CHECK_HOURS ?? 24);

const DEFAULT_SETTINGS = {
  currency: 'USD',
  units: 'imperial',
  theme: 'system',
  accent: 'blue',
  autoTag: true,
  tagRules: [],
  trackPrices: true,
  showConverted: true,
  layout: 'grid',
  sort: 'added',
};

/* ───────────────────────── helpers ───────────────────────── */

const str = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const settingsOf = (u) => ({ ...DEFAULT_SETTINGS, ...JSON.parse(u.settings || '{}') });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

function userJson(u) {
  return { id: u.id, username: u.username, name: u.name, isAdmin: !!u.is_admin, settings: settingsOf(u), createdAt: u.created_at };
}

function listJson(l) {
  return {
    id: l.id, name: l.name, emoji: l.emoji, color: l.color, position: l.position,
    shareToken: l.share_token, createdAt: l.created_at, updatedAt: l.updated_at,
  };
}

function itemJson(r, tags = []) {
  return {
    id: r.id, listId: r.list_id, url: r.url, title: r.title, brand: r.brand, siteName: r.site_name, domain: r.domain,
    image: r.image ? `/images/${r.image}` : null, imageSource: r.image_source, price: r.price, currency: r.currency,
    previousPrice: r.previous_price, description: r.description, notes: r.notes, quantity: r.quantity,
    purchased: !!r.purchased, favorite: !!r.favorite, size: r.size, weightG: r.weight_g, lengthCm: r.length_cm,
    widthCm: r.width_cm, heightCm: r.height_cm, fetchStatus: r.fetch_status, fetchError: r.fetch_error,
    createdAt: r.created_at, updatedAt: r.updated_at, checkedAt: r.checked_at, tags,
  };
}

function tagsFor(itemIds) {
  const map = new Map(itemIds.map((i) => [i, []]));
  if (!itemIds.length) return map;
  const rows = all(
    `SELECT item_id, tag, auto FROM item_tags WHERE item_id IN (${itemIds.map(() => '?').join(',')}) ORDER BY auto DESC, tag`,
    ...itemIds,
  );
  for (const r of rows) map.get(r.item_id)?.push({ name: r.tag, auto: !!r.auto });
  return map;
}

function loadItem(itemId) {
  const row = get('SELECT * FROM items WHERE id = ?', itemId);
  return row ? itemJson(row, tagsFor([row.id]).get(row.id)) : null;
}

function ownItem(req) {
  const row = get('SELECT * FROM items WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  return row || fail(404, 'Item not found');
}

function ownList(req, listId = req.params.id) {
  const row = get('SELECT * FROM lists WHERE id = ? AND user_id = ?', listId, req.user.id);
  return row || fail(404, 'List not found');
}

function createList(userId, { name, emoji = '🎁', color = 'blue' }) {
  const pos = get('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM lists WHERE user_id = ?', userId).p;
  const listId = id();
  run(
    'INSERT INTO lists (id, user_id, name, emoji, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    listId, userId, name, emoji, color, pos, now(), now(),
  );
  return get('SELECT * FROM lists WHERE id = ?', listId);
}

function update(table, rowId, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = :${k}`).join(', ')} WHERE id = :__id`, { ...fields, __id: rowId });
}

function setTags(itemId, tags) {
  run('DELETE FROM item_tags WHERE item_id = ?', itemId);
  for (const t of tags) {
    const name = str(t.name ?? t, 40);
    if (name) run('INSERT OR IGNORE INTO item_tags (item_id, tag, auto) VALUES (?, ?, ?)', itemId, name, t.auto ? 1 : 0);
  }
}

function signupAllowed() {
  if (get('SELECT COUNT(*) AS n FROM users').n === 0) return true;
  if (process.env.DISABLE_SIGNUP === 'true') return false;
  return kvGet('allowSignup') ?? process.env.ALLOW_SIGNUP === 'true';
}

function validateCredentials(username, password) {
  if (!/^[a-z0-9._-]{2,32}$/i.test(username || '')) fail(400, 'Usernames are 2–32 letters, numbers, dots, dashes or underscores');
  if (typeof password !== 'string' || password.length < 8) fail(400, 'Passwords need at least 8 characters');
}

function createUser({ username, password, name, isAdmin, settings }) {
  validateCredentials(username, password);
  if (get('SELECT 1 FROM users WHERE username = ?', username)) fail(409, 'That username is taken');
  const userId = id();
  const clean = {};
  for (const k of ['currency', 'units']) if (typeof settings?.[k] === 'string') clean[k] = settings[k];
  tx(() => {
    run(
      'INSERT INTO users (id, username, name, password_hash, is_admin, settings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      userId, username.toLowerCase(), str(name, 80) || username, hashPassword(password), isAdmin ? 1 : 0, JSON.stringify(clean), now(),
    );
    createList(userId, { name: 'My Wishlist', emoji: '🎁', color: 'blue' });
  });
  return get('SELECT * FROM users WHERE id = ?', userId);
}

async function storeScrape(userId, listId, scraped, settings, extra = {}) {
  const image = await downloadImage(scraped.image, scraped.url);
  const itemId = id();
  const t = now();
  tx(() => {
    run(
      `INSERT INTO items (id, user_id, list_id, url, title, brand, site_name, domain, image, image_source, price, currency,
        description, size, weight_g, length_cm, width_cm, height_cm, fetch_status, fetch_error, created_at, updated_at, checked_at)
       VALUES (:id, :user, :list, :url, :title, :brand, :site, :domain, :image, :imageSource, :price, :currency,
        :description, :size, :weight, :length, :width, :height, :status, :error, :t, :t, :t)`,
      {
        id: itemId, user: userId, list: listId, url: scraped.url, title: scraped.title, brand: scraped.brand,
        site: scraped.siteName, domain: scraped.domain, image, imageSource: scraped.image, price: scraped.price,
        currency: scraped.currency || settings.currency, description: scraped.description, size: scraped.size,
        weight: scraped.weight_g, length: scraped.length_cm, width: scraped.width_cm, height: scraped.height_cm,
        status: scraped.status, error: scraped.error, t,
      },
    );
    if (extra.notes) run('UPDATE items SET notes = ? WHERE id = ?', extra.notes, itemId);
    if (scraped.price != null) {
      run('INSERT INTO price_history (item_id, price, currency, at) VALUES (?, ?, ?, ?)', itemId, scraped.price, scraped.currency, t);
    }
    const tags = settings.autoTag ? autoTags(scraped, settings.tagRules).map((name) => ({ name, auto: true })) : [];
    setTags(itemId, tags);
  });
  return itemId;
}

async function refreshItem(row) {
  const s = await scrapeProduct(row.url);
  const fields = { checked_at: now(), fetch_status: s.status, fetch_error: s.error };
  const priceChanged = s.price != null && (row.price == null || Math.abs(s.price - row.price) > 0.004 || (s.currency && s.currency !== row.currency));
  if (priceChanged) {
    Object.assign(fields, { previous_price: row.price, price: s.price, currency: s.currency || row.currency });
    run('INSERT INTO price_history (item_id, price, currency, at) VALUES (?, ?, ?, ?)', row.id, s.price, s.currency || row.currency, now());
  }
  // Only fill gaps — never overwrite details the user may have edited.
  if (!row.brand && s.brand) fields.brand = s.brand;
  if (!row.site_name && s.siteName) fields.site_name = s.siteName;
  if ((!row.title || row.fetch_status !== 'ok') && s.status === 'ok' && s.title) fields.title = s.title;
  if (!row.image && s.image) {
    const image = await downloadImage(s.image, s.url);
    if (image) Object.assign(fields, { image, image_source: s.image });
  }
  if (priceChanged || fields.title || fields.brand || fields.image) fields.updated_at = now();
  update('items', row.id, fields);
  return priceChanged;
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ───────────────────────── app ───────────────────────── */

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION }));

app.get('/api/auth/status', (req, res) => {
  res.json({ needsSetup: get('SELECT COUNT(*) AS n FROM users').n === 0, signupAllowed: signupAllowed(), version: VERSION });
});

app.post('/api/auth/register', loginLimiter, wrap(async (req, res) => {
  if (!signupAllowed()) fail(403, 'Sign-ups are turned off. Ask your admin to create an account for you.');
  const { username, password, name, settings } = req.body || {};
  const first = get('SELECT COUNT(*) AS n FROM users').n === 0;
  const user = createUser({ username, password, name, isAdmin: first, settings });
  const token = createSession(user.id);
  setSessionCookie(req, res, token);
  res.json({ user: userJson(user) });
}));

app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const user = get('SELECT * FROM users WHERE username = ?', String(username || ''));
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) fail(401, 'Incorrect username or password');
  const token = createSession(user.id);
  setSessionCookie(req, res, token);
  res.json({ user: userJson(user) });
}));

app.post('/api/auth/logout', (req, res) => {
  const cookie = /(?:^|;\s*)wl_session=([^;]+)/.exec(req.get('cookie') || '')?.[1];
  if (cookie) destroySession(decodeURIComponent(cookie));
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Public, read-only view of a shared list.
app.get('/api/public/lists/:token', wrap(async (req, res) => {
  const list = get('SELECT * FROM lists WHERE share_token = ?', req.params.token) || fail(404, 'This list is no longer shared');
  const owner = get('SELECT * FROM users WHERE id = ?', list.user_id);
  const rows = all('SELECT * FROM items WHERE list_id = ? ORDER BY purchased, created_at DESC', list.id);
  const tags = tagsFor(rows.map((r) => r.id));
  const items = rows.map((r) => {
    const { notes, fetchError, fetchStatus, imageSource, ...pub } = itemJson(r, tags.get(r.id));
    return pub;
  });
  const s = settingsOf(owner);
  res.json({
    list: { name: list.name, emoji: list.emoji, color: list.color },
    owner: { name: owner.name },
    settings: { currency: s.currency, units: s.units, showConverted: s.showConverted },
    items,
    rates: await getRates(),
  });
}));

const images = express.static(IMAGE_DIR, { maxAge: '365d', immutable: true, fallthrough: false });
app.use('/images', (req, res, next) => {
  res.set({ 'Content-Security-Policy': "default-src 'none'", 'X-Content-Type-Options': 'nosniff' });
  images(req, res, next);
});

/* ───────────────────────── authenticated API ───────────────────────── */

const api = express.Router();
api.use(requireAuth);

api.get('/events', subscribe);

api.get('/bootstrap', wrap(async (req, res) => {
  const lists = all('SELECT * FROM lists WHERE user_id = ? ORDER BY position, created_at', req.user.id);
  const rows = all('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC', req.user.id);
  const tags = tagsFor(rows.map((r) => r.id));
  res.json({
    user: userJson(req.user),
    lists: lists.map(listJson),
    items: rows.map((r) => itemJson(r, tags.get(r.id))),
    rates: await getRates(),
    server: {
      version: VERSION,
      browser: browserMode(),
      priceCheckHours: PRICE_CHECK_HOURS,
      signupAllowed: signupAllowed(),
      builtInTags: BUILT_IN_TAGS,
    },
  });
}));

/* account */

api.patch('/me', wrap(async (req, res) => {
  const { name, settings } = req.body || {};
  const fields = {};
  if (name !== undefined) fields.name = str(name, 80) || req.user.username;
  if (settings && typeof settings === 'object') {
    const merged = { ...JSON.parse(req.user.settings || '{}'), ...settings };
    if (!Array.isArray(merged.tagRules)) merged.tagRules = [];
    merged.tagRules = merged.tagRules
      .filter((r) => r && str(r.tag, 40))
      .slice(0, 100)
      .map((r) => ({ tag: str(r.tag, 40), keywords: str(r.keywords, 500) || '' }));
    fields.settings = JSON.stringify(merged);
  }
  update('users', req.user.id, fields);
  emit(req.user.id, { what: 'user' });
  res.json({ user: userJson(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
}));

api.post('/me/password', wrap(async (req, res) => {
  const { current, next } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.password_hash)) fail(400, 'Your current password is incorrect');
  if (typeof next !== 'string' || next.length < 8) fail(400, 'Passwords need at least 8 characters');
  update('users', req.user.id, { password_hash: hashPassword(next) });
  const keep = crypto.createHash('sha256').update(req.token).digest('hex');
  run("DELETE FROM sessions WHERE user_id = ? AND kind = 'session' AND token_hash != ?", req.user.id, keep);
  res.json({ ok: true });
}));

api.post('/me/logout-others', wrap(async (req, res) => {
  const keep = crypto.createHash('sha256').update(req.token).digest('hex');
  const { changes } = run("DELETE FROM sessions WHERE user_id = ? AND kind = 'session' AND token_hash != ?", req.user.id, keep);
  res.json({ ok: true, signedOut: changes });
}));

/* API tokens (for iOS Shortcuts, scripts, bookmarklets) */

api.get('/tokens', (req, res) => {
  const rows = all("SELECT token_hash, name, created_at, last_used_at FROM sessions WHERE user_id = ? AND kind = 'api' ORDER BY created_at DESC", req.user.id);
  res.json({ tokens: rows.map((r) => ({ id: r.token_hash.slice(0, 16), name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at })) });
});

api.post('/tokens', (req, res) => {
  const token = createSession(req.user.id, 'api', str(req.body?.name, 60) || 'API token');
  res.json({ token });
});

api.delete('/tokens/:id', (req, res) => {
  run("DELETE FROM sessions WHERE user_id = ? AND kind = 'api' AND substr(token_hash, 1, 16) = ?", req.user.id, req.params.id);
  res.json({ ok: true });
});

/* lists */

api.post('/lists', (req, res) => {
  const list = createList(req.user.id, {
    name: str(req.body?.name, 80) || 'New List',
    emoji: str(req.body?.emoji, 16) || '🎁',
    color: str(req.body?.color, 20) || 'blue',
  });
  emit(req.user.id, { what: 'lists' });
  res.json({ list: listJson(list) });
});

api.post('/lists/reorder', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  tx(() => ids.forEach((listId, i) => run('UPDATE lists SET position = ? WHERE id = ? AND user_id = ?', i + 1, listId, req.user.id)));
  emit(req.user.id, { what: 'lists' });
  res.json({ ok: true });
});

api.patch('/lists/:id', (req, res) => {
  const list = ownList(req);
  const fields = { updated_at: now() };
  const b = req.body || {};
  if (b.name !== undefined) fields.name = str(b.name, 80) || list.name;
  if (b.emoji !== undefined) fields.emoji = str(b.emoji, 16);
  if (b.color !== undefined) fields.color = str(b.color, 20);
  update('lists', list.id, fields);
  emit(req.user.id, { what: 'lists' });
  res.json({ list: listJson(get('SELECT * FROM lists WHERE id = ?', list.id)) });
});

api.post('/lists/:id/share', (req, res) => {
  const list = ownList(req);
  const token = req.body?.enabled ? list.share_token || crypto.randomBytes(12).toString('base64url') : null;
  update('lists', list.id, { share_token: token, updated_at: now() });
  emit(req.user.id, { what: 'lists' });
  res.json({ list: listJson(get('SELECT * FROM lists WHERE id = ?', list.id)) });
});

api.delete('/lists/:id', wrap(async (req, res) => {
  const list = ownList(req);
  const imgs = all('SELECT image FROM items WHERE list_id = ?', list.id);
  run('DELETE FROM lists WHERE id = ?', list.id);
  await Promise.all(imgs.map((r) => deleteImage(r.image)));
  emit(req.user.id, { what: 'lists' });
  res.json({ ok: true });
}));

/* items */

api.post('/items', wrap(async (req, res) => {
  const b = req.body || {};
  const rawUrl = str(b.url, 4000) || fail(400, 'Paste a link to a product');
  let url;
  try {
    url = cleanUrl(/https?:\/\/\S+/.exec(rawUrl)?.[0] || rawUrl);
  } catch {
    fail(400, "That doesn't look like a link");
  }
  let list = b.listId ? ownList(req, b.listId) : get('SELECT * FROM lists WHERE user_id = ? ORDER BY position LIMIT 1', req.user.id);
  list ||= createList(req.user.id, { name: 'My Wishlist' });

  const dupe = get('SELECT id FROM items WHERE list_id = ? AND url = ?', list.id, url);
  if (dupe && !b.allowDuplicate) return res.json({ item: loadItem(dupe.id), duplicate: true });

  const settings = settingsOf(req.user);
  let scraped;
  try {
    scraped = await scrapeProduct(url, { html: typeof b.html === 'string' ? b.html : undefined });
  } catch (err) {
    fail(400, err.message);
  }
  const itemId = await storeScrape(req.user.id, list.id, scraped, settings, { notes: str(b.notes, 2000) });
  emit(req.user.id, { what: 'items' });
  res.json({ item: loadItem(itemId) });
}));

api.post('/items/retag', (req, res) => {
  const settings = settingsOf(req.user);
  const rows = all('SELECT * FROM items WHERE user_id = ?', req.user.id);
  tx(() => {
    for (const r of rows) {
      run('DELETE FROM item_tags WHERE item_id = ? AND auto = 1', r.id);
      const tags = autoTags({ title: r.title, brand: r.brand, siteName: r.site_name, domain: r.domain, description: r.description }, settings.tagRules);
      for (const t of tags) run('INSERT OR IGNORE INTO item_tags (item_id, tag, auto) VALUES (?, ?, 1)', r.id, t);
    }
  });
  emit(req.user.id, { what: 'items' });
  res.json({ ok: true, count: rows.length });
});

const ITEM_FIELDS = {
  title: ['title', (v) => str(v, 300)],
  brand: ['brand', (v) => str(v, 80)],
  siteName: ['site_name', (v) => str(v, 80)],
  price: ['price', (v) => (num(v) == null ? null : Math.max(0, Math.round(num(v) * 100) / 100))],
  currency: ['currency', (v) => (typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : null)],
  notes: ['notes', (v) => str(v, 2000)],
  quantity: ['quantity', (v) => Math.min(999, Math.max(1, Math.round(num(v) || 1)))],
  purchased: ['purchased', (v) => (v ? 1 : 0)],
  favorite: ['favorite', (v) => (v ? 1 : 0)],
  size: ['size', (v) => str(v, 60)],
  weightG: ['weight_g', num],
  lengthCm: ['length_cm', num],
  widthCm: ['width_cm', num],
  heightCm: ['height_cm', num],
  description: ['description', (v) => str(v, 1000)],
};

api.patch('/items/:id', wrap(async (req, res) => {
  const row = ownItem(req);
  const b = req.body || {};
  const fields = {};
  for (const [key, [col, conv]] of Object.entries(ITEM_FIELDS)) if (key in b) fields[col] = conv(b[key]);
  if ('url' in b) {
    try {
      fields.url = cleanUrl(b.url);
      fields.domain = new URL(fields.url).hostname.replace(/^www\d?\./, '');
    } catch {
      fail(400, "That doesn't look like a link");
    }
  }
  if (b.listId && b.listId !== row.list_id) fields.list_id = ownList(req, b.listId).id;
  if (b.imageUrl) {
    const image = await downloadImage(b.imageUrl, row.url);
    if (!image) fail(400, "Couldn't download that image");
    await deleteImage(row.image);
    Object.assign(fields, { image, image_source: b.imageUrl });
  }
  if ('price' in fields && fields.price !== row.price && fields.price != null) {
    run('INSERT INTO price_history (item_id, price, currency, at) VALUES (?, ?, ?, ?)', row.id, fields.price, fields.currency || row.currency, now());
    fields.previous_price = null;
  }
  fields.updated_at = now();
  tx(() => {
    update('items', row.id, fields);
    if (Array.isArray(b.tags)) {
      const existing = new Map(tagsFor([row.id]).get(row.id).map((t) => [t.name.toLowerCase(), t.auto]));
      setTags(row.id, b.tags.map((t) => {
        const name = typeof t === 'string' ? t : t.name;
        return { name, auto: existing.get(String(name).toLowerCase()) || false };
      }));
    }
  });
  emit(req.user.id, { what: 'items' });
  res.json({ item: loadItem(row.id) });
}));

api.post('/items/:id/refresh', wrap(async (req, res) => {
  const row = ownItem(req);
  await refreshItem(row);
  emit(req.user.id, { what: 'items' });
  res.json({ item: loadItem(row.id) });
}));

api.get('/items/:id/history', (req, res) => {
  const row = ownItem(req);
  res.json({ history: all('SELECT price, currency, at FROM price_history WHERE item_id = ? ORDER BY at', row.id) });
});

api.delete('/items/:id', wrap(async (req, res) => {
  const row = ownItem(req);
  run('DELETE FROM items WHERE id = ?', row.id);
  await deleteImage(row.image);
  emit(req.user.id, { what: 'items' });
  res.json({ ok: true });
}));

/* tags */

api.post('/tags/rename', (req, res) => {
  const from = str(req.body?.from, 40) || fail(400, 'Missing tag');
  const to = str(req.body?.to, 40) || fail(400, 'Missing new name');
  tx(() => {
    const rows = all('SELECT t.item_id FROM item_tags t JOIN items i ON i.id = t.item_id WHERE i.user_id = ? AND t.tag = ?', req.user.id, from);
    for (const r of rows) {
      run('DELETE FROM item_tags WHERE item_id = ? AND tag = ?', r.item_id, from);
      run('INSERT OR IGNORE INTO item_tags (item_id, tag, auto) VALUES (?, ?, 0)', r.item_id, to);
    }
  });
  emit(req.user.id, { what: 'items' });
  res.json({ ok: true });
});

api.delete('/tags/:name', (req, res) => {
  run('DELETE FROM item_tags WHERE tag = ? AND item_id IN (SELECT id FROM items WHERE user_id = ?)', req.params.name, req.user.id);
  emit(req.user.id, { what: 'items' });
  res.json({ ok: true });
});

/* export / import */

api.get('/export', (req, res) => {
  const lists = all('SELECT * FROM lists WHERE user_id = ? ORDER BY position', req.user.id);
  const rows = all('SELECT * FROM items WHERE user_id = ? ORDER BY created_at', req.user.id);
  const tags = tagsFor(rows.map((r) => r.id));
  const out = {
    app: 'wishlist',
    format: 1,
    exportedAt: new Date().toISOString(),
    lists: lists.map((l) => ({
      name: l.name, emoji: l.emoji, color: l.color,
      items: rows.filter((r) => r.list_id === l.id).map((r) => {
        const { id: _id, listId, image, fetchStatus, fetchError, ...rest } = itemJson(r, tags.get(r.id));
        return { ...rest, tags: rest.tags.map((t) => t.name) };
      }),
    })),
  };
  res.set('Content-Disposition', `attachment; filename="wishlist-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(out);
});

api.post('/import', wrap(async (req, res) => {
  const lists = Array.isArray(req.body?.lists) ? req.body.lists : fail(400, "That file doesn't look like a Wishlist export");
  const pending = [];
  let count = 0;
  tx(() => {
    for (const l of lists) {
      const list = createList(req.user.id, { name: str(l.name, 80) || 'Imported', emoji: str(l.emoji, 16) || '🎁', color: str(l.color, 20) || 'blue' });
      for (const it of Array.isArray(l.items) ? l.items : []) {
        let url;
        try {
          url = cleanUrl(it.url);
        } catch {
          continue;
        }
        const itemId = id();
        const t = Number(it.createdAt) || now();
        run(
          `INSERT INTO items (id, user_id, list_id, url, title, brand, site_name, domain, image_source, price, currency, previous_price,
            description, notes, quantity, purchased, favorite, size, weight_g, length_cm, width_cm, height_cm, fetch_status, created_at, updated_at)
           VALUES (:id, :user, :list, :url, :title, :brand, :site, :domain, :src, :price, :currency, :prev, :description, :notes,
            :quantity, :purchased, :favorite, :size, :weight, :length, :width, :height, 'ok', :t, :t)`,
          {
            id: itemId, user: req.user.id, list: list.id, url, title: str(it.title, 300), brand: str(it.brand, 80),
            site: str(it.siteName, 80), domain: new URL(url).hostname.replace(/^www\d?\./, ''), src: str(it.imageSource, 4000),
            price: num(it.price), currency: str(it.currency, 3), prev: num(it.previousPrice), description: str(it.description, 1000),
            notes: str(it.notes, 2000), quantity: Math.max(1, Math.round(num(it.quantity) || 1)), purchased: !!it.purchased,
            favorite: !!it.favorite, size: str(it.size, 60), weight: num(it.weightG), length: num(it.lengthCm),
            width: num(it.widthCm), height: num(it.heightCm), t,
          },
        );
        setTags(itemId, (Array.isArray(it.tags) ? it.tags : []).map((name) => ({ name, auto: false })));
        if (it.imageSource) pending.push([itemId, it.imageSource, url]);
        count++;
      }
    }
  });
  emit(req.user.id, { what: 'lists' });
  res.json({ ok: true, lists: lists.length, items: count });
  // Fetch images after responding.
  for (const [itemId, src, ref] of pending) {
    const image = await downloadImage(src, ref);
    if (image) run('UPDATE items SET image = ? WHERE id = ?', image, itemId);
  }
  if (pending.length) emit(req.user.id, { what: 'items' });
}));

/* admin */

api.get('/admin/users', requireAdmin, (req, res) => {
  const rows = all(`SELECT u.*, (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id) AS item_count FROM users u ORDER BY u.created_at`);
  res.json({ users: rows.map((u) => ({ ...userJson(u), settings: undefined, itemCount: u.item_count })) });
});

api.post('/admin/users', requireAdmin, (req, res) => {
  const { username, password, name, isAdmin } = req.body || {};
  const user = createUser({ username, password, name, isAdmin, settings: settingsOf(req.user) });
  res.json({ user: userJson(user) });
});

api.patch('/admin/users/:id', requireAdmin, (req, res) => {
  const target = get('SELECT * FROM users WHERE id = ?', req.params.id) || fail(404, 'User not found');
  const { isAdmin, password } = req.body || {};
  const fields = {};
  if (isAdmin !== undefined) {
    if (!isAdmin && target.is_admin && get('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').n <= 1) fail(400, 'There must be at least one admin');
    fields.is_admin = isAdmin ? 1 : 0;
  }
  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 8) fail(400, 'Passwords need at least 8 characters');
    fields.password_hash = hashPassword(password);
    run('DELETE FROM sessions WHERE user_id = ?', target.id);
  }
  update('users', target.id, fields);
  res.json({ ok: true });
});

api.delete('/admin/users/:id', requireAdmin, wrap(async (req, res) => {
  if (req.params.id === req.user.id) fail(400, "You can't delete your own account here");
  const imgs = all('SELECT image FROM items WHERE user_id = ?', req.params.id);
  run('DELETE FROM users WHERE id = ?', req.params.id);
  await Promise.all(imgs.map((r) => deleteImage(r.image)));
  res.json({ ok: true });
}));

api.patch('/admin/settings', requireAdmin, (req, res) => {
  if (typeof req.body?.allowSignup === 'boolean') kvSet('allowSignup', req.body.allowSignup);
  res.json({ signupAllowed: signupAllowed() });
});

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ───────────────────────── web app ───────────────────────── */

app.use(express.static(DIST, {
  index: false,
  setHeaders(res, file) {
    if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    else res.set('Cache-Control', 'no-cache');
  },
}));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/images/')) return next();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(DIST, 'index.html'), (err) => err && res.status(404).send('Web app not built. Run `npm run build`.'));
});

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
});

/* ───────────────────────── background price checks ───────────────────────── */

let checking = false;
async function priceCheckTick() {
  if (!PRICE_CHECK_HOURS || checking) return;
  checking = true;
  try {
    const due = all(
      `SELECT i.*, u.settings AS user_settings FROM items i JOIN users u ON u.id = i.user_id
       WHERE i.purchased = 0 AND (i.checked_at IS NULL OR i.checked_at < ?) ORDER BY i.checked_at LIMIT 25`,
      now() - PRICE_CHECK_HOURS * 3600_000,
    );
    for (const row of due) {
      const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(row.user_settings || '{}') };
      if (!settings.trackPrices) {
        update('items', row.id, { checked_at: now() });
        continue;
      }
      try {
        if (await refreshItem(row)) emit(row.user_id, { what: 'items' });
      } catch (err) {
        update('items', row.id, { checked_at: now() });
        console.warn(`Price check failed for ${row.url}: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000));
    }
  } finally {
    checking = false;
  }
}

app.listen(PORT, () => {
  console.log(`Wishlist ${VERSION} listening on http://0.0.0.0:${PORT}`);
  console.log(`Headless browser: ${browserMode()}`);
  getRates().catch(() => {});
  setTimeout(priceCheckTick, 60_000);
  setInterval(priceCheckTick, 10 * 60_000);
});
