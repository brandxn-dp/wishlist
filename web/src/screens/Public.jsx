import { useEffect, useMemo, useState } from 'react';
import { applyTheme, colorOf, useDark } from '../theme.js';
import { SearchField, Spinner, Empty } from '../ui.jsx';
import { money, totals, plural } from '../format.js';
import { ItemCard } from './ListDetail.jsx';

export default function PublicList({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const dark = useDark();

  useEffect(() => {
    applyTheme({ theme: 'system', accent: 'blue' });
    fetch(`/api/public/lists/${token}`)
      .then((r) => r.json().then((j) => (r.ok ? setData(j) : setError(j.error || 'Not found'))))
      .catch(() => setError("Couldn't load this list."));
  }, [token]);

  useEffect(() => {
    if (data) document.title = `${data.list.name} · Wishlist`;
  }, [data]);

  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = q ? data.items.filter((i) => [i.title, i.brand, i.siteName].some((v) => v?.toLowerCase().includes(q))) : data.items;
    return [...list].sort((a, b) => a.purchased - b.purchased || b.favorite - a.favorite || b.createdAt - a.createdAt);
  }, [data, query]);

  if (error) {
    return (
      <div className="splash">
        <Empty icon="lock" title="List unavailable" text={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="splash">
        <Spinner large />
      </div>
    );
  }

  const { currency, showConverted } = data.settings;
  const color = colorOf(data.list.color, dark);
  const t = totals(data.items, currency, data.rates);

  return (
    <div className="app">
      <div className="page-scroll no-tabbar" style={{ height: '100%' }}>
        <div className="public-head">
          <div className="list-preview-icon" style={{ '--c': color }}>{data.list.emoji || '🎁'}</div>
          <h1>{data.list.name}</h1>
          <p>Shared by {data.owner.name}</p>
        </div>
        <div className="content wide">
          <div className="hero" style={{ '--hero': color }}>
            <div className="hero-label">Total</div>
            <div className="hero-total">{money(t.total, currency)}</div>
            <div className="hero-sub">
              <span>{plural(t.count, 'item')}</span>
              {t.bought > 0 && <span>{t.bought} already purchased</span>}
            </div>
            <div className="hero-emoji">{data.list.emoji}</div>
          </div>
          {data.items.length > 6 && (
            <div className="toolbar">
              <SearchField value={query} onChange={setQuery} />
            </div>
          )}
          <div className="grid">
            {items.map((i) => (
              <ItemCard key={i.id} item={i} currency={currency} rates={data.rates} showConverted={showConverted} readOnly />
            ))}
          </div>
          <p className="center muted mt" style={{ fontSize: 13, padding: '24px 0' }}>Tap an item to open it in the store.</p>
        </div>
      </div>
    </div>
  );
}
