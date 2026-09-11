export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'CNY', 'INR', 'CHF', 'SEK', 'NOK', 'DKK', 'ISK', 'PLN', 'CZK', 'HUF',
  'RON', 'BGN', 'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'ZAR', 'SGD', 'HKD', 'TWD', 'KRW', 'THB', 'PHP', 'IDR', 'MYR',
  'VND', 'AED', 'SAR', 'QAR', 'ILS', 'TRY', 'EGP', 'NGN', 'KES', 'UAH', 'PKR',
];

let names;
export function currencyName(code) {
  try {
    names ||= new Intl.DisplayNames(undefined, { type: 'currency' });
    return names.of(code);
  } catch {
    return code;
  }
}

const fmtCache = new Map();
export function money(amount, currency = 'USD', { compact = false } = {}) {
  if (amount == null || Number.isNaN(amount)) return '—';
  const key = `${currency}|${compact}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }
    fmtCache.set(key, f);
  }
  return f.format(amount);
}

export function currencySymbol(currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

export function convert(amount, from, to, rates) {
  if (amount == null) return null;
  if (!from || !to || from === to) return amount;
  const r = rates?.rates;
  if (!r?.[from] || !r?.[to]) return null;
  return (amount / r[from]) * r[to];
}

/** Totals for a set of items, in the viewer's currency. */
export function totals(items, currency, rates) {
  let total = 0, purchased = 0, count = 0, bought = 0, unpriced = 0, unconverted = 0;
  for (const it of items) {
    const qty = it.quantity || 1;
    if (it.purchased) bought++;
    else count++;
    if (it.price == null) {
      if (!it.purchased) unpriced++;
      continue;
    }
    const v = convert(it.price * qty, it.currency || currency, currency, rates);
    if (v == null) {
      unconverted++;
      continue;
    }
    if (it.purchased) purchased += v;
    else total += v;
  }
  return { total, purchased, count, bought, unpriced, unconverted };
}

export const priceDrop = (it) =>
  it.previousPrice != null && it.price != null && it.price < it.previousPrice - 0.004
    ? Math.round((1 - it.price / it.previousPrice) * 100)
    : 0;

export function weight(g, units) {
  if (g == null) return null;
  if (units === 'imperial') {
    const lb = g / 453.592;
    return lb >= 1 ? `${round(lb, 1)} lb` : `${round(g / 28.3495, 1)} oz`;
  }
  return g >= 1000 ? `${round(g / 1000, 2)} kg` : `${round(g, 0)} g`;
}

export function length(cm, units) {
  if (cm == null) return null;
  return units === 'imperial' ? `${round(cm / 2.54, 1)} in` : `${round(cm, 1)} cm`;
}

export function dimensions(item, units) {
  const parts = [item.lengthCm, item.widthCm, item.heightCm].filter((v) => v != null);
  if (!parts.length) return null;
  const f = units === 'imperial' ? (v) => round(v / 2.54, 1) : (v) => round(v, 1);
  return `${parts.map(f).join(' × ')} ${units === 'imperial' ? 'in' : 'cm'}`;
}

// Convert a user-entered value in display units back to metric storage units.
export const toGrams = (v, units) => (v === '' || v == null ? null : units === 'imperial' ? Number(v) * 453.592 : Number(v) * 1000);
export const fromGrams = (g, units) => (g == null ? '' : round(units === 'imperial' ? g / 453.592 : g / 1000, 2));
export const toCm = (v, units) => (v === '' || v == null ? null : units === 'imperial' ? Number(v) * 2.54 : Number(v));
export const fromCm = (cm, units) => (cm == null ? '' : round(units === 'imperial' ? cm / 2.54 : cm, 1));

function round(v, d) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

export function timeAgo(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (s < 60) return 'just now';
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day');
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Stable colour for a tag name.
const TAG_COLORS = ['#007AFF', '#AF52DE', '#FF2D55', '#FF9500', '#34C759', '#30B0C7', '#5856D6', '#A2845E', '#FF3B30', '#00C7BE'];
export function tagColor(name = '') {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export function extractUrl(text = '') {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (m) return m[0].replace(/[).,;]+$/, '');
  const t = text.trim();
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : null;
}
