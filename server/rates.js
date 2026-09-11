import { kvGet, kvSet } from './db.js';

const TTL = 12 * 60 * 60 * 1000;
let inflight = null;

async function fetchRates() {
  const sources = [
    async () => {
      const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(10_000) });
      const j = await r.json();
      if (j.result !== 'success') throw new Error('bad response');
      return j.rates;
    },
    async () => {
      const r = await fetch('https://api.frankfurter.app/latest?from=USD', { signal: AbortSignal.timeout(10_000) });
      const j = await r.json();
      return { USD: 1, ...j.rates };
    },
  ];
  for (const source of sources) {
    try {
      const rates = await source();
      if (rates && rates.EUR) return rates;
    } catch {
      /* try next source */
    }
  }
  return null;
}

/** Returns { base: 'USD', rates, updatedAt } — cached, refreshed in the background every 12h. */
export async function getRates() {
  const cached = kvGet('rates');
  const fresh = cached && Date.now() - cached.updatedAt < TTL;
  if (!fresh && !inflight) {
    inflight = fetchRates()
      .then((rates) => {
        if (rates) kvSet('rates', { base: 'USD', rates, updatedAt: Date.now() });
      })
      .finally(() => (inflight = null));
  }
  if (!cached && inflight) await inflight;
  return kvGet('rates') || { base: 'USD', rates: { USD: 1 }, updatedAt: 0 };
}
