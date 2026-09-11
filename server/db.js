import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const IMAGE_DIR = path.join(DATA_DIR, 'images');
fs.mkdirSync(IMAGE_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'wishlist.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const migrations = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'session',
    name TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    emoji TEXT,
    color TEXT,
    position REAL NOT NULL DEFAULT 0,
    share_token TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX lists_user ON lists(user_id);
  CREATE TABLE items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    brand TEXT,
    site_name TEXT,
    domain TEXT,
    image TEXT,
    image_source TEXT,
    price REAL,
    currency TEXT,
    previous_price REAL,
    description TEXT,
    notes TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    purchased INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER NOT NULL DEFAULT 0,
    size TEXT,
    weight_g REAL,
    length_cm REAL,
    width_cm REAL,
    height_cm REAL,
    fetch_status TEXT,
    fetch_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    checked_at INTEGER
  );
  CREATE INDEX items_user ON items(user_id);
  CREATE INDEX items_list ON items(list_id);
  CREATE TABLE item_tags (
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag TEXT NOT NULL COLLATE NOCASE,
    auto INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, tag)
  );
  CREATE TABLE price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    price REAL,
    currency TEXT,
    at INTEGER NOT NULL
  );
  CREATE INDEX price_history_item ON price_history(item_id);
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT);
  `,
];

const version = db.prepare('PRAGMA user_version').get().user_version;
for (let v = version; v < migrations.length; v++) {
  db.exec('BEGIN');
  try {
    db.exec(migrations[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// node:sqlite rejects undefined/boolean parameters, so normalise them.
const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const params = (args) =>
  args.length === 1 && args[0] && typeof args[0] === 'object' && !Buffer.isBuffer(args[0])
    ? [Object.fromEntries(Object.entries(args[0]).map(([k, v]) => [k, clean(v)]))]
    : args.map(clean);

const cache = new Map();
const stmt = (sql) => {
  let s = cache.get(sql);
  if (!s) cache.set(sql, (s = db.prepare(sql)));
  return s;
};

export const get = (sql, ...args) => stmt(sql).get(...params(args));
export const all = (sql, ...args) => stmt(sql).all(...params(args));
export const run = (sql, ...args) => stmt(sql).run(...params(args));

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const id = () => crypto.randomBytes(12).toString('base64url');
export const now = () => Date.now();

export function kvGet(key) {
  const row = get('SELECT value FROM kv WHERE key = ?', key);
  return row ? JSON.parse(row.value) : undefined;
}
export function kvSet(key, value) {
  run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}
