import * as cheerio from 'cheerio';
import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { IMAGE_DIR, id } from './db.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const MAX_HTML = 6 * 1024 * 1024;
const MAX_IMAGE = 12 * 1024 * 1024;

/* ───────────────────────── network helpers ───────────────────────── */

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublic(url) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http and https links are supported');
  if (process.env.ALLOW_PRIVATE_URLS === 'true') return;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('Links to private network addresses are blocked');
}

async function safeFetch(url, { accept, referer, timeout = 12_000 } = {}) {
  const jar = new Map();
  let current = url;
  const kind = !accept ? 'document' : accept.startsWith('image') ? 'image' : 'empty';
  for (let hop = 0; hop < 8; hop++) {
    await assertPublic(current);
    const headers = {
      'User-Agent': UA,
      Accept: accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Sec-Fetch-Dest': kind,
      'Sec-Fetch-Mode': { document: 'navigate', image: 'no-cors', empty: 'cors' }[kind],
      'Sec-Fetch-Site': referer || kind === 'empty' ? 'same-origin' : 'none',
    };
    if (kind === 'document') headers['Upgrade-Insecure-Requests'] = '1';
    if (referer) headers.Referer = referer;
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(current, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    return { res, url: current };
  }
  throw new Error('Too many redirects');
}

async function readBody(res, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > max) break;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function decode(buf, contentType = '') {
  let charset = /charset=([^;]+)/i.exec(contentType)?.[1];
  if (!charset) charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1'))?.[1];
  try {
    return new TextDecoder(charset?.trim() || 'utf-8').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

async function fetchHtml(url) {
  const { res, url: finalUrl } = await safeFetch(url);
  const html = decode(await readBody(res, MAX_HTML), res.headers.get('content-type'));
  return { html, url: finalUrl, status: res.status };
}

/* ───────────────────────── headless browser ─────────────────────────
 * The Docker image ships Chromium, launched on demand and closed when idle.
 * BROWSER_URL / BROWSER_WS_URL point at an external Chrome instead; BROWSER=off disables it. */

const CHROME_PATHS = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
let chromePath;
function localChromePath() {
  if (chromePath === undefined) {
    chromePath = CHROME_PATHS.find((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    }) || null;
  }
  return chromePath;
}

export function browserMode() {
  if (process.env.BROWSER === 'off') return 'off';
  if (process.env.BROWSER_URL || process.env.BROWSER_WS_URL) return 'remote';
  return localChromePath() ? 'built-in' : 'off';
}

export const browserConfigured = () => browserMode() !== 'off';

let launched = null; // Promise<Browser> for the built-in Chromium
let idleTimer = null;
let openPages = 0;

async function localBrowser() {
  clearTimeout(idleTimer);
  if (!launched) {
    const { default: puppeteer } = await import('puppeteer-core');
    launched = puppeteer
      .launch({
        executablePath: localChromePath(),
        headless: true,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--mute-audio', '--lang=en-US',
          '--disable-blink-features=AutomationControlled', '--window-size=1280,900',
        ],
      })
      .then((b) => {
        b.on('disconnected', () => (launched = null));
        return b;
      })
      .catch((err) => {
        launched = null;
        throw err;
      });
  }
  return launched;
}

// Free Chromium's memory once nothing has needed it for a while.
function closeWhenIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (openPages || !launched) return;
    const b = await launched.catch(() => null);
    launched = null;
    await b?.close().catch(() => {});
  }, 90_000);
}

let rendering = 0;
const renderQueue = [];
async function withRenderSlot(fn) {
  if (rendering >= 2) await new Promise((r) => renderQueue.push(r));
  rendering++;
  try {
    return await fn();
  } finally {
    rendering--;
    renderQueue.shift()?.();
  }
}

async function browserEndpoint() {
  if (process.env.BROWSER_WS_URL) return process.env.BROWSER_WS_URL;
  if (!process.env.BROWSER_URL) return null;
  // Chrome's devtools endpoint rejects Host headers that aren't an IP, so resolve the hostname first.
  const u = new URL(process.env.BROWSER_URL);
  const { address } = net.isIP(u.hostname) ? { address: u.hostname } : await dns.lookup(u.hostname);
  const hostPort = `${address.includes(':') ? `[${address}]` : address}:${u.port || 9222}`;
  const r = await fetch(`${u.protocol}//${hostPort}/json/version`, { signal: AbortSignal.timeout(5000) });
  const { webSocketDebuggerUrl } = await r.json();
  const ws = new URL(webSocketDebuggerUrl);
  ws.host = hostPort;
  return ws.href;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|\[?f[cd])/i;

// A fresh tab that presents as regular desktop Chrome (not "HeadlessChrome"), matching the real engine version.
async function stealthPage(browser) {
  const page = await browser.newPage();
  const major = /\/(\d+)/.exec(await browser.version())?.[1] || '139';
  const cdp = await page.createCDPSession();
  await cdp.send('Network.setUserAgentOverride', {
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
    acceptLanguage: 'en-US,en;q=0.9',
    platform: 'Linux x86_64',
    userAgentMetadata: {
      brands: [{ brand: 'Google Chrome', version: major }, { brand: 'Chromium', version: major }, { brand: 'Not.A/Brand', version: '99' }],
      fullVersion: `${major}.0.0.0`,
      platform: 'Linux',
      platformVersion: '',
      architecture: 'x86',
      model: '',
      mobile: false,
    },
  });
  await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
  await page.setViewport({ width: 1280, height: 900 });
  return page;
}

// Run fn(page) in the built-in (or external) browser, at most two tabs at a time.
async function withBrowserPage(fn) {
  const mode = browserMode();
  return withRenderSlot(async () => {
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = mode === 'remote' ? await puppeteer.connect({ browserWSEndpoint: await browserEndpoint() }) : await localBrowser();
    openPages++;
    let page;
    try {
      page = await stealthPage(browser);
      return await fn(page);
    } finally {
      openPages--;
      await page?.close().catch(() => {});
      if (mode === 'remote') await browser.disconnect().catch(() => {});
      else closeWhenIdle();
    }
  });
}

// Some image CDNs refuse plain requests; load the image in the browser instead.
async function fetchImageViaBrowser(src, referer) {
  if (browserMode() === 'off') return null;
  await assertPublic(src);
  return withBrowserPage(async (page) => {
    const res = await page.goto(src, { referer, waitUntil: 'load', timeout: 20_000 });
    if (!res?.ok()) return null;
    return { type: (res.headers()['content-type'] || '').split(';')[0].trim().toLowerCase(), buf: await res.buffer() };
  });
}

async function renderWithBrowser(url) {
  if (browserMode() === 'off') return null;
  await assertPublic(url);
  return withBrowserPage(async (page) => {
      // Skip heavy assets, and never let a page pull from the local network.
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        let host = '';
        try {
          host = new URL(req.url()).hostname;
        } catch {
          /* data: URLs etc. */
        }
        if (['image', 'media', 'font'].includes(req.resourceType()) || (process.env.ALLOW_PRIVATE_URLS !== 'true' && PRIVATE_HOST.test(host))) {
          req.abort().catch(() => {});
        } else req.continue().catch(() => {});
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 8000 }).catch(() => {});
      return { html: await page.content(), url: page.url() };
  });
}

/* ───────────────────────── store APIs (for stores that block page scraping) ───────────────────────── */

function bestBuyRef(url) {
  const u = new URL(url);
  if (!/(^|\.)bestbuy\.com$/i.test(u.hostname)) return null;
  const sku =
    u.searchParams.get('skuId') ||
    /\/sku\/(\d{6,9})/i.exec(u.pathname)?.[1] ||
    /\/(\d{6,9})\.p\b/.exec(u.pathname)?.[1];
  if (sku) return { sku };
  // New-style links: /product/<name>/<productId>
  const m = /\/product\/([^/]+)\/([A-Z0-9]{6,})/i.exec(u.pathname);
  return m ? { slug: m[1], productId: m[2] } : null;
}

async function bestBuyBlocks(skus) {
  const { res } = await safeFetch(`https://www.bestbuy.com/api/3.0/priceBlocks?skus=${skus.join(',')}`, { accept: 'application/json' });
  if (!res.ok) return [];
  const data = JSON.parse((await readBody(res, MAX_HTML)).toString('utf8'));
  return Array.isArray(data) ? data.map((b) => b?.sku).filter(Boolean) : [];
}

// New-style links carry no SKU. Search for the product name, then keep the result whose
// canonical URL contains the same product id — an exact match, not a guess.
async function bestBuyFromProductId(slug, productId) {
  let words = slug;
  try {
    words = decodeURIComponent(slug);
  } catch {
    /* keep raw */
  }
  const query = words.replace(/-/g, ' ').split(/\s+/).slice(0, 12).join(' ');
  const { res } = await safeFetch(`https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(query)}`);
  if (!res.ok) return null;
  const html = (await readBody(res, MAX_HTML)).toString('utf8');
  const candidates = [...new Set([...html.matchAll(/(?:"skuId"|"sku"|data-sku-id=)\s*:?\s*"?(\d{7,8})\b/g)].map((m) => m[1]))].slice(0, 60);
  const id = productId.toLowerCase();
  const matches = [];
  for (let i = 0; i < candidates.length; i += 20) {
    matches.push(...(await bestBuyBlocks(candidates.slice(i, i + 20))).filter((s) => s.url?.toLowerCase().split(/[/?#]/).includes(id)));
    if (matches.some((s) => String(s.skuId).length === 7)) break;
  }
  // One product id can cover Best Buy's own listing (7-digit SKU) and marketplace sellers (longer SKUs).
  return matches.sort((a, b) => String(a.skuId).length - String(b.skuId).length)[0] || null;
}

// Best Buy blocks automated visits to product pages (even real headless Chrome), but its
// price API answers normally — and product photos live at a predictable CDN address.
async function fromBestBuy(url) {
  const ref = bestBuyRef(url);
  if (!ref) return null;
  const s = ref.sku ? (await bestBuyBlocks([ref.sku]))[0] : await bestBuyFromProductId(ref.slug, ref.productId);
  if (!s?.names?.short) return null;
  const sku = String(s.skuId || ref.sku);
  const brand = clean(s.brand?.brand);
  let title = clean(s.names.short);
  if (brand && title.toLowerCase().startsWith(`${brand.toLowerCase()} - `)) title = title.slice(brand.length + 3);
  const p = s.price || {};
  return {
    // Remember the SKU in the link so later price checks skip the search.
    url: ref.sku ? null : `${url}${url.includes('?') ? '&' : '?'}skuId=${sku}`,
    title,
    brand,
    price: parsePrice(p.currentPrice ?? p.customerPrice ?? p.regularPrice),
    currency: 'USD',
    image: `https://pisces.bbystatic.com/image2/BestBuy_US/images/products/${sku.slice(0, 4)}/${sku}_sd.jpg`,
    siteName: 'Best Buy',
    categories: [],
  };
}

const STORE_APIS = [fromBestBuy];

async function fromStoreApi(url) {
  for (const adapter of STORE_APIS) {
    const data = await adapter(url).catch(() => null);
    if (data) return data;
  }
  return null;
}

/* ───────────────────────── value parsing ───────────────────────── */

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s) || null;

const SYMBOLS = [
  ['US$', 'USD'], ['CA$', 'CAD'], ['C$', 'CAD'], ['AU$', 'AUD'], ['A$', 'AUD'], ['NZ$', 'NZD'], ['HK$', 'HKD'],
  ['S$', 'SGD'], ['R$', 'BRL'], ['MX$', 'MXN'], ['£', 'GBP'], ['€', 'EUR'], ['₹', 'INR'], ['₩', 'KRW'], ['₽', 'RUB'],
  ['₺', 'TRY'], ['₪', 'ILS'], ['₫', 'VND'], ['₱', 'PHP'], ['฿', 'THB'], ['zł', 'PLN'], ['CHF', 'CHF'], ['Kč', 'CZK'],
];
const ISO = /\b(USD|EUR|GBP|CAD|AUD|NZD|JPY|CNY|INR|CHF|SEK|NOK|DKK|PLN|MXN|BRL|SGD|HKD|KRW|ZAR|TRY|ILS|AED|CZK)\b/;

function tldCurrency(domain = '') {
  const map = [
    [/\.ca$/, 'CAD'], [/\.(com\.)?au$/, 'AUD'], [/\.(co\.)?nz$/, 'NZD'], [/\.(com\.)?mx$/, 'MXN'], [/\.(com\.)?br$/, 'BRL'],
    [/\.sg$/, 'SGD'], [/\.hk$/, 'HKD'], [/\.co\.uk$|\.uk$/, 'GBP'], [/\.co\.jp$|\.jp$/, 'JPY'], [/\.in$/, 'INR'],
    [/\.se$/, 'SEK'], [/\.no$/, 'NOK'], [/\.dk$/, 'DKK'], [/\.ch$/, 'CHF'], [/\.pl$/, 'PLN'], [/\.cn$/, 'CNY'],
    [/\.(de|fr|it|es|nl|be|at|ie|fi|pt|gr)$/, 'EUR'],
  ];
  return map.find(([re]) => re.test(domain))?.[1] || null;
}

export function detectCurrency(text = '', domain = '') {
  const iso = ISO.exec(text)?.[1];
  if (iso) return iso;
  for (const [sym, code] of SYMBOLS) if (text.includes(sym)) return code;
  if (text.includes('¥')) return /\.cn$/.test(domain) ? 'CNY' : 'JPY';
  if (/\bkr\b/i.test(text)) return tldCurrency(domain) || 'SEK';
  if (text.includes('$')) {
    const t = tldCurrency(domain);
    return ['CAD', 'AUD', 'NZD', 'MXN', 'SGD', 'HKD'].includes(t) ? t : 'USD';
  }
  return null;
}

export function parsePrice(input, { text = false } = {}) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (input == null) return null;
  const m = /\d[\d.,'\s  ]*/.exec(String(input));
  if (!m) return null;
  let n = m[0].replace(/[\s  ']/g, '').replace(/[.,]$/, '');
  const dot = n.lastIndexOf('.');
  const comma = n.lastIndexOf(',');
  if (dot > -1 && comma > -1) {
    n = comma > dot ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '');
  } else if (comma > -1) {
    const decimals = n.length - comma - 1;
    n = decimals === 3 || n.split(',').length > 2 ? n.replace(/,/g, '') : n.replace(',', '.');
  } else if (dot > -1) {
    const decimals = n.length - dot - 1;
    if (n.split('.').length > 2 || (text && decimals === 3)) n = n.replace(/\./g, '');
  }
  const v = parseFloat(n);
  return Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v * 100) / 100 : null;
}

const WEIGHT = { GRM: 1, G: 1, KGM: 1000, KG: 1000, LBR: 453.592, LB: 453.592, LBS: 453.592, ONZ: 28.3495, OZ: 28.3495 };
const LENGTH = { CMT: 1, CM: 1, MMT: 0.1, MM: 0.1, MTR: 100, M: 100, INH: 2.54, IN: 2.54, INCH: 2.54, INCHES: 2.54, FOT: 30.48, FT: 30.48 };

function quantity(v, table, fallbackUnit) {
  if (v == null) return null;
  if (Array.isArray(v)) v = v[0];
  let value, unit;
  if (typeof v === 'object') {
    value = parseFloat(v.value);
    unit = String(v.unitCode || v.unitText || fallbackUnit).toUpperCase();
  } else {
    const m = /([\d.,]+)\s*([a-zA-Z]+)?/.exec(String(v));
    if (!m) return null;
    value = parseFloat(m[1].replace(',', '.'));
    unit = String(m[2] || fallbackUnit).toUpperCase();
  }
  const factor = table[unit];
  return Number.isFinite(value) && factor ? Math.round(value * factor * 100) / 100 : null;
}

/* ───────────────────────── HTML extraction ───────────────────────── */

function jsonLd($) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    out.push(node);
    if (node['@graph']) visit(node['@graph']);
    if (node.mainEntity) visit(node.mainEntity);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      visit(JSON.parse(raw));
    } catch {
      try {
        visit(JSON.parse(raw.replace(/[ -]+/g, ' ')));
      } catch {
        /* ignore malformed blocks */
      }
    }
  });
  return out;
}

const typeIs = (node, re) => [].concat(node?.['@type'] || []).some((t) => re.test(String(t)));
const first = (v) => (Array.isArray(v) ? v[0] : v);
const nameOf = (v) => clean(typeof first(v) === 'object' ? first(v)?.name : first(v));

function imageOf(v) {
  v = first(v);
  if (!v) return null;
  if (typeof v === 'string') return v;
  return v.url || v.contentUrl || v['@id'] || null;
}

function offerOf(offers) {
  const list = [].concat(offers || []).flatMap((o) =>
    o && typeIs(o, /AggregateOffer/) ? [...[].concat(o.offers || []), o] : [o],
  );
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const spec = first(o.priceSpecification);
    const price = parsePrice(o.price ?? o.lowPrice ?? spec?.price ?? o.highPrice);
    if (price != null) return { price, currency: clean(o.priceCurrency || spec?.priceCurrency) };
  }
  return null;
}

function fromJsonLd(nodes) {
  const products = nodes.filter((n) => typeIs(n, /Product(Group|Model)?$/i));
  if (!products.length) return {};
  // Prefer the product that actually has offers.
  let p = products.find((n) => n.offers) || products[0];
  let offer = offerOf(p.offers);
  if (!offer && p.hasVariant) {
    const variant = [].concat(p.hasVariant).find((v) => offerOf(v?.offers));
    if (variant) offer = offerOf(variant.offers);
  }
  const crumbs = nodes
    .filter((n) => typeIs(n, /BreadcrumbList/))
    .flatMap((n) => [].concat(n.itemListElement || []))
    .map((e) => nameOf(e?.item) || clean(e?.name))
    .filter(Boolean);
  return {
    title: clean(p.name),
    brand: nameOf(p.brand) || nameOf(p.manufacturer),
    image: imageOf(p.image) || imageOf(first(p.hasVariant)?.image),
    price: offer?.price ?? null,
    currency: offer?.currency || null,
    description: clean(p.description),
    categories: [...[].concat(p.category || []).map((c) => (typeof c === 'string' ? c : c?.name)), ...crumbs].filter(Boolean),
    weight_g: quantity(p.weight, WEIGHT, 'GRM'),
    length_cm: quantity(p.depth, LENGTH, 'CMT'),
    width_cm: quantity(p.width, LENGTH, 'CMT'),
    height_cm: quantity(p.height, LENGTH, 'CMT'),
    size: clean(typeof p.size === 'string' ? p.size : null),
  };
}

function fromAmazon($, domain) {
  if (!/(^|\.)amazon\./.test(domain) && !/(^|\.)amzn\./.test(domain)) return {};
  let image = $('#landingImage').attr('data-old-hires') || null;
  if (!image) {
    try {
      const dyn = JSON.parse($('#landingImage, #imgBlkFront, #ebooksImgBlkFront').attr('data-a-dynamic-image') || '{}');
      image = Object.entries(dyn).sort((a, b) => b[1][0] * b[1][1] - a[1][0] * a[1][1])[0]?.[0] || null;
    } catch {
      /* no dynamic image */
    }
  }
  image ||= $('#landingImage').attr('src') || $('#imgBlkFront').attr('src') || null;
  const priceText =
    $('#twister-plus-price-data-price').attr('value') ||
    $('#corePrice_feature_div .a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #apex_desktop .a-price .a-offscreen').first().text() ||
    $('#priceblock_ourprice, #priceblock_dealprice, #price_inside_buybox, #kindle-price, .a-price .a-offscreen').first().text();
  const symbol = $('#twister-plus-price-data-price-unit').attr('value') || priceText;
  let brand = clean($('#bylineInfo').text()) || clean($('tr.po-brand td.po-break-word').text());
  if (brand) brand = brand.replace(/^(Visit the|Brand:|Marca:|Marque\s?:|Marke:)\s*/i, '').replace(/\s+Store$/i, '').trim();
  const crumbs = $('#wayfinding-breadcrumbs_feature_div li a').map((_, a) => clean($(a).text())).get();
  return {
    title: clean($('#productTitle').text()) || clean($('#ebooksProductTitle').text()),
    brand: brand || null,
    image,
    price: parsePrice(priceText, { text: true }),
    currency: detectCurrency(symbol, domain),
    categories: crumbs,
    siteName: 'Amazon',
  };
}

function fromMeta($, pageUrl, domain) {
  const meta = (...names) => {
    for (const n of names) {
      const v = $(`meta[property="${n}"]`).attr('content') || $(`meta[name="${n}"]`).attr('content') ||
        $(`meta[itemprop="${n}"]`).attr('content');
      if (clean(v)) return clean(v);
    }
    return null;
  };
  const itemprop = (name) => {
    const el = $(`[itemprop="${name}"]`).first();
    return clean(el.attr('content') || el.attr('src') || el.attr('href') || el.text());
  };
  const priceRaw = meta('product:price:amount', 'og:price:amount', 'twitter:data1') || itemprop('price');
  const currency =
    meta('product:price:currency', 'og:price:currency') || itemprop('priceCurrency') ||
    (priceRaw ? detectCurrency(priceRaw, domain) : null);
  const brandEl = $('[itemprop="brand"]').first();
  const brand = meta('product:brand', 'og:brand', 'brand') ||
    clean(brandEl.find('[itemprop="name"]').attr('content') || brandEl.find('[itemprop="name"]').text()) ||
    clean(brandEl.attr('content')) || clean(brandEl.text());
  let image = meta('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src') || itemprop('image') ||
    $('link[rel="image_src"]').attr('href');
  return {
    title: meta('og:title', 'twitter:title') || itemprop('name') || clean($('title').first().text()),
    brand,
    image,
    price: parsePrice(priceRaw, { text: !/^[\d.]+$/.test(priceRaw || '') }),
    currency: currency && /^[A-Z]{3}$/.test(currency.toUpperCase()) ? currency.toUpperCase() : null,
    description: meta('og:description', 'description', 'twitter:description'),
    siteName: meta('og:site_name', 'application-name', 'apple-mobile-web-app-title'),
    canonical: $('link[rel="canonical"]').attr('href') || meta('og:url'),
  };
}

// Last resort: look for currency-looking text in an element whose class mentions "price".
// A wrong price is worse than none, so skip page chrome, carousels, add-ons and monthly prices.
const PRICE_NOISE = [
  'header', 'nav', 'footer', 'aside', '[class*="recommend" i]', '[class*="carousel" i]', '[class*="related" i]',
  '[class*="similar" i]', '[class*="bundle" i]', '[class*="protection" i]', '[class*="warranty" i]', '[class*="plan-" i]',
  '[class*="shipping" i]', '[class*="installment" i]', '[class*="monthly" i]', '[class*="upsell" i]', '[class*="accessor" i]',
  '[class*="sponsor" i]', '[class*="cart" i]',
].join(', ');
const PREFERRED_PRICE = [
  '[data-testid*="product-price" i]', '[data-test*="product-price" i]', '[class*="product-price" i]', '[id*="product-price" i]',
  '[class*="current-price" i]', '[class*="price-current" i]', '[class*="sale-price" i]', '[class*="final-price" i]',
].join(', ');

function fromPriceClasses($, domain) {
  let found = null;
  for (const selector of [PREFERRED_PRICE, '[class*="price" i], [id*="price" i], [data-price]']) {
    $(selector).each((i, el) => {
      if (i > 60 || found) return false;
      const $el = $(el);
      if ($el.closest(PRICE_NOISE).length) return;
      const dp = $el.attr('data-price');
      const text = clean($el.children().length > 6 ? '' : $el.text()) || '';
      const candidate = dp && /\d/.test(dp) ? dp : text.length < 40 ? text : '';
      if (!candidate || /\/\s*mo\b|per month|a month|\/ea\b|per item|shipping|\bsave\b|\boff\b|%/i.test(candidate)) return;
      if (/[$€£¥₹]|\b(USD|EUR|GBP|CAD|AUD)\b/.test(candidate + ($el.text() || '').slice(0, 40))) {
        const price = parsePrice(candidate, { text: true });
        if (price) found = { price, currency: detectCurrency(candidate || text, domain) };
      }
    });
    if (found) break;
  }
  return found || {};
}

const BLOCKED = /robot check|access denied|attention required|just a moment|are you a (human|robot)|captcha|pardon our interruption|request unsuccessful|verify you are human|403 forbidden|page not found|bot detection/i;

function looksBlocked($, status, domain = '') {
  const title = clean($('title').first().text()) || '';
  if (status === 403 || status === 429 || status === 503) return true;
  if (BLOCKED.test(title) || $('form[action*="validateCaptcha"]').length > 0) return true;
  // Some protections answer 200 with an interstitial whose title is just the bare host
  // (Fnac serves "fnac.com" this way, both to a plain fetch and to headless Chrome). A real
  // product page never titles itself with nothing but its own hostname, and without this the
  // interstitial reads as a product page that merely happens to have no price.
  return Boolean(domain) && title.toLowerCase() === domain.toLowerCase();
}

function merge(target, ...sources) {
  for (const src of sources) {
    for (const [k, v] of Object.entries(src || {})) {
      if (k === 'categories') target.categories = [...(target.categories || []), ...(v || [])];
      else if ((target[k] == null || target[k] === '') && v != null && v !== '') target[k] = v;
    }
  }
  return target;
}

export function parseHtml(html, pageUrl, status = 200) {
  const $ = cheerio.load(html);
  const domain = new URL(pageUrl).hostname.replace(/^www\d?\./, '');
  const blocked = looksBlocked($, status, domain);
  const ld = jsonLd($);
  const data = { domain, categories: [] };
  merge(data, fromAmazon($, domain), fromJsonLd(ld));
  if (!blocked) merge(data, fromMeta($, pageUrl, domain), data.price == null ? fromPriceClasses($, domain) : {});
  else merge(data, { siteName: fromMeta($, pageUrl, domain).siteName });
  // Client-rendered pages sometimes ship placeholder text like "undefined : Target".
  for (const k of ['title', 'description', 'brand']) if (data[k] && /\b(undefined|null)\b/.test(data[k])) data[k] = null;
  const ogType = $('meta[property="og:type"]').attr('content') || '';
  data.isListing = /product\.group/i.test(ogType) ||
    (ld.some((n) => typeIs(n, /CollectionPage|ItemList|SearchResultsPage/)) && !ld.some((n) => typeIs(n, /Product/i)));
  data.currency ||= data.price != null ? tldCurrency(domain) || 'USD' : null;
  data.blocked = blocked;
  data.isShopify = /cdn\.shopify\.com|Shopify\.theme|shopify-digital-wallet/.test(html);
  data.shopifyCurrency = /Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/.exec(html)?.[1] || null;
  if (data.image) {
    try {
      data.image = new URL(data.image.startsWith('//') ? `https:${data.image}` : data.image, pageUrl).href;
    } catch {
      data.image = null;
    }
  }
  return data;
}

async function fromShopify(url, currencyHint) {
  const u = new URL(url);
  const m = /\/products\/[^/?#]+/.exec(u.pathname);
  if (!m) return {};
  const { res } = await safeFetch(`${u.origin}${m[0]}.js`, { accept: 'application/json' });
  if (!res.ok) return {};
  const p = JSON.parse((await readBody(res, MAX_HTML)).toString('utf8'));
  const variantId = u.searchParams.get('variant');
  const variant = p.variants?.find((v) => String(v.id) === variantId) || p.variants?.[0];
  const cents = variant?.price ?? p.price;
  const img = variant?.featured_image?.src || p.featured_image || p.images?.[0];
  return {
    title: clean(p.title),
    brand: clean(p.vendor),
    price: typeof cents === 'number' ? cents / 100 : null,
    currency: currencyHint,
    image: img ? (img.startsWith('//') ? `https:${img}` : img) : null,
    categories: [p.type, ...(p.tags || [])].filter(Boolean),
    weight_g: variant?.weight || null,
  };
}

/* ───────────────────────── public API ───────────────────────── */

const SITE_NAMES = {
  'amazon': 'Amazon', 'bestbuy': 'Best Buy', 'target': 'Target', 'walmart': 'Walmart', 'ebay': 'eBay', 'etsy': 'Etsy',
  'apple': 'Apple', 'ikea': 'IKEA', 'rei': 'REI', 'nike': 'Nike', 'adidas': 'adidas', 'costco': 'Costco',
  'homedepot': 'The Home Depot', 'lowes': "Lowe's", 'wayfair': 'Wayfair', 'sephora': 'Sephora', 'ulta': 'Ulta Beauty',
  'nordstrom': 'Nordstrom', 'zara': 'Zara', 'uniqlo': 'UNIQLO', 'hm': 'H&M', 'aliexpress': 'AliExpress', 'newegg': 'Newegg',
  'bhphotovideo': 'B&H', 'patagonia': 'Patagonia', 'lego': 'LEGO', 'steampowered': 'Steam', 'crateandbarrel': 'Crate & Barrel',
  'williams-sonoma': 'Williams Sonoma', 'potterybarn': 'Pottery Barn', 'westelm': 'West Elm', 'asos': 'ASOS', 'ssense': 'SSENSE',
};

export function prettySite(domain) {
  const parts = domain.split('.');
  const root = parts.length > 2 && /^(co|com|org|net)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] || parts[0];
  return SITE_NAMES[root] || root.charAt(0).toUpperCase() + root.slice(1);
}

function titleFromUrl(url) {
  const segs = new URL(url).pathname.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s).replace(/\.\w+$/, '');
    } catch {
      return s;
    }
  });
  // Pick the slug with the most real words, e.g. "apple_airpods_pro_2" over "1793628-REG".
  const words = (s) => s.split(/[-_]+/).filter((w) => /^[a-z]{2,}/i.test(w)).length;
  const slug = segs.filter((s) => /[-_]/.test(s)).sort((a, b) => words(b) - words(a))[0];
  if (!slug || words(slug) < 2) return null;
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function tidyTitle(title, siteName, domain) {
  if (!title) return title;
  const site = (siteName || '').toLowerCase();
  const root = domain.split('.')[0];
  const parts = title.split(/\s+[|–—-]\s+|\s*:\s+(?=[A-Z])/);
  if (parts.length > 1) {
    const kept = parts.filter((p) => {
      const l = p.toLowerCase().trim();
      return l !== site && !l.includes(root + '.') && l !== root && !/^(shop|buy|official site)/.test(l);
    });
    if (kept.length) title = kept.sort((a, b) => b.length - a.length)[0];
  }
  return title.replace(/^Amazon\.[\w.]+\s*:\s*/i, '').trim();
}

const TRACKING = /^(utm_\w+|fbclid|gclid|gbraid|wbraid|msclkid|mc_[ce]id|_ga|ref|ref_|psc|pd_rd_\w+|pf_rd_\w+|content-id|smid|th|linkCode|tag|ascsubtag|srsltid|irclickid|clickid|affiliate\w*)$/i;

export function cleanUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    u = new URL(`https://${String(raw).trim()}`);
  }
  const host = u.hostname.replace(/^www\./, '');
  // Amazon: reduce to the canonical /dp/ASIN form.
  const asin = /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/)([A-Z0-9]{10})/i.exec(u.pathname)?.[1];
  if (/^amazon\./.test(host) && asin) return `${u.origin}/dp/${asin.toUpperCase()}`;
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  u.hash = '';
  return u.href;
}

/**
 * Scrape a product page. Pass `html` to skip the network fetch (e.g. HTML captured by an iOS Shortcut).
 * Never throws for page problems — returns whatever could be found plus an `error` message.
 */
export async function scrapeProduct(rawUrl, { html } = {}) {
  const url = cleanUrl(rawUrl);
  const domain = new URL(url).hostname.replace(/^www\d?\./, '');
  const data = { url, domain, categories: [] };
  const errors = [];

  let page = null;
  const fromApi = html ? null : await fromStoreApi(url);
  if (fromApi) {
    merge(data, fromApi);
    if (fromApi.url) data.url = fromApi.url;
  }
  else if (html) page = { html, url, status: 200 };
  else {
    try {
      page = await fetchHtml(url);
    } catch (err) {
      errors.push(err.cause?.code || err.message);
      if (/private network|Only http/.test(err.message)) throw err;
    }
  }
  let dead = false;
  if (page) {
    const parsed = parseHtml(page.html, page.url, page.status);
    const redirectedAway = parsed.isListing && new URL(page.url).pathname !== new URL(url).pathname;
    if (parsed.blocked) errors.push(`${prettySite(domain)} blocked the request`);
    else if (page.status === 404 || page.status === 410) errors.push("That page couldn't be found — the link may be broken");
    else if (page.status >= 400) errors.push(`The store returned an error (${page.status})`);
    else if (redirectedAway) errors.push('That link now opens a category page — the product may no longer be available');
    dead = !parsed.blocked && (page.status >= 400 || redirectedAway);
    if (dead) merge(data, { siteName: parsed.siteName });
    else {
      merge(data, parsed);
      if ((parsed.isShopify || /\/products\//.test(url)) && (data.price == null || !data.brand)) {
        try {
          merge(data, await fromShopify(page.url, parsed.shopifyCurrency || data.currency));
        } catch {
          /* not a Shopify store after all */
        }
      }
    }
  }

  const incomplete = !data.title || data.price == null || !data.image || data.blocked;
  if (!html && !dead && incomplete && browserConfigured()) {
    try {
      const rendered = await renderWithBrowser(url);
      if (rendered) {
        const parsed = parseHtml(rendered.html, rendered.url);
        if (!parsed.blocked) {
          // Rendered data is more trustworthy than a bot-blocked static fetch.
          if (data.blocked) for (const k of ['title', 'image', 'price', 'currency']) data[k] = null;
          merge(data, parsed);
          data.blocked = false;
          // Only drop the earlier errors if the render actually recovered something. A store
          // that blocks the plain fetch usually blocks the browser too, and clearing the
          // errors unconditionally replaced "<store> blocked the request" with the far more
          // misleading "Couldn't find the price or image".
          if (parsed.price != null || parsed.image) errors.length = 0;
        }
      }
    } catch (err) {
      errors.push(`Browser: ${err.message}`);
    }
  }

  if (data.blocked) data.title = null;
  data.siteName ||= prettySite(domain);
  data.title = tidyTitle(data.title, data.siteName, domain) || titleFromUrl(url) || data.siteName;
  if (data.brand && data.brand.length > 60) data.brand = null;
  if (data.description) data.description = data.description.slice(0, 1000);
  data.categories = [...new Set(data.categories.map(clean).filter(Boolean))].slice(0, 20);
  const missing = ['price', 'image'].filter((k) => data[k] == null);
  data.status = missing.length === 0 ? 'ok' : 'partial';
  // The last error is the most informative (e.g. the headless browser's, after a blocked plain fetch).
  data.error = errors[errors.length - 1] || (missing.length ? `Couldn't find the ${missing.join(' or ')}` : null);
  delete data.blocked;
  delete data.isListing;
  delete data.isShopify;
  delete data.shopifyCurrency;
  delete data.canonical;
  return data;
}

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

async function plainImage(src, referer) {
  const { res } = await safeFetch(src, { accept: 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5', referer });
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type && !type.startsWith('image/') && type !== 'application/octet-stream') return null;
  return { type, buf: await readBody(res, MAX_IMAGE) };
}

/** Download an image into the data dir. Returns the stored filename or null. */
export async function downloadImage(src, referer) {
  if (!src) return null;
  try {
    let buf, type;
    if (src.startsWith('data:')) {
      const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(src);
      if (!m) return null;
      [type, buf] = [m[1], Buffer.from(m[2], 'base64')];
    } else {
      const got = (await plainImage(src, referer).catch(() => null)) || (await fetchImageViaBrowser(src, referer).catch(() => null));
      if (!got) return null;
      ({ type, buf } = got);
      if (!EXT[type]) {
        const ext = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.exec(src)?.[1]?.toLowerCase();
        if (!ext) return null;
        type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      }
    }
    if (!EXT[type] || buf.length < 100 || buf.length >= MAX_IMAGE) return null;
    const name = `${id()}.${EXT[type]}`;
    await fs.writeFile(path.join(IMAGE_DIR, name), buf);
    return name;
  } catch {
    return null;
  }
}

export async function deleteImage(name) {
  if (name && /^[\w-]+\.\w+$/.test(name)) await fs.unlink(path.join(IMAGE_DIR, name)).catch(() => {});
}
