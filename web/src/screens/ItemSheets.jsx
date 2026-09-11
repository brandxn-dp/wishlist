import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, getState, nav as navState, addItem, updateItem } from '../store.js';
import { api } from '../api.js';
import { colorOf, useDark } from '../theme.js';
import {
  Group, Row, Toggle, SheetHeader, GlassButton, Spinner, ProductImage, presentSheet, promptAlert, confirmAlert, toast,
} from '../ui.jsx';
import { Icon } from '../icons.jsx';
import {
  CURRENCIES, money, convert, extractUrl, timeAgo, tagColor, fromGrams, toGrams, fromCm, toCm, currencySymbol,
} from '../format.js';
import { refreshPrice, confirmDeleteItem } from './ListDetail.jsx';

/* ═════════════════════════ Add item ═════════════════════════ */

export function openAddSheet(url = '', { listId, autoSubmit = false } = {}) {
  return presentSheet(({ close }) => <AddItemSheet initialUrl={url} listId={listId} autoSubmit={autoSubmit} close={close} />, { size: 'auto' });
}

function AddItemSheet({ initialUrl, listId, autoSubmit, close }) {
  const lists = useStore((s) => s.lists);
  const dark = useDark();
  const [url, setUrl] = useState(initialUrl);
  const [target, setTarget] = useState(listId || navState.activeListId || lists[0]?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);
  const link = extractUrl(url);

  const submit = async (allowDuplicate = false) => {
    if (!link || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await addItem({ url: link, listId: target, allowDuplicate });
      if (res.duplicate) {
        setBusy(false);
        const again = await confirmAlert({
          title: 'Already on this list',
          message: res.item.title,
          confirm: 'Add Again',
          cancel: 'Show It',
        });
        if (again) return submit(true);
        close();
        openItemEditor(res.item.id);
        return;
      }
      const listName = getState().lists.find((l) => l.id === res.item.listId)?.name || 'your list';
      close();
      toast(`Added to ${listName}`);
      if (res.item.fetchStatus !== 'ok') setTimeout(() => openItemEditor(res.item.id, { justAdded: true }), 350);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoSubmit && link && !started.current) {
      started.current = true;
      submit();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(extractUrl(text) || text);
    } catch {
      toast('Paste with ⌘V / long-press instead', { error: true });
    }
  };

  let host = '';
  try {
    host = link ? new URL(link).hostname.replace(/^www\./, '') : '';
  } catch {
    /* ignore */
  }

  return (
    <>
      <SheetHeader
        left={<GlassButton icon="x" title="Cancel" onClick={() => close()} />}
        title="Add Item"
        right={<GlassButton icon="arrowUp" title="Add" prominent disabled={!link || busy} onClick={() => submit()} />}
      />
      <div className="sheet-body">
        {busy ? (
          <div className="fetching">
            <div className="skeleton-card">
              <div className="sk-img shimmer" />
              <div className="sk-line shimmer" />
              <div className="sk-line short shimmer" />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 500 }}>
              <Spinner /> Getting details from {host || 'the store'}…
            </div>
          </div>
        ) : (
          <>
            <form className="url-field" onSubmit={(e) => (e.preventDefault(), submit())}>
              <Icon name="link" size={20} style={{ color: 'var(--label-3)' }} />
              <input
                autoFocus
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="Paste a product link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {url ? (
                <button onClick={() => setUrl('')} aria-label="Clear" style={{ color: 'var(--label-3)', display: 'grid', padding: 8 }}>
                  <Icon name="xCircle" size={20} />
                </button>
              ) : (
                navigator.clipboard?.readText && (
                  <button className="btn small tinted" onClick={paste}>
                    <Icon name="clipboard" size={18} /> Paste
                  </button>
                )
              )}
            </form>
            {error && (
              <div className="notice">
                <Icon name="warning" size={20} />
                <div>{error}</div>
              </div>
            )}
            {lists.length > 0 && (
              <Group header="Add to" subtle>
                {lists.map((l) => (
                  <Row key={l.id} emoji={l.emoji} round iconBg={colorOf(l.color, dark)} title={l.name} check={l.id === target} onClick={() => setTarget(l.id)} />
                ))}
              </Group>
            )}
            <p className="group-footer" style={{ textAlign: 'center', padding: '0 32px' }}>
              Tip: paste a link anywhere in the app to add it instantly, or set up the iPhone Shortcut in Settings.
            </p>
          </>
        )}
      </div>
    </>
  );
}

/* ═════════════════════════ Edit item ═════════════════════════ */

export function openItemEditor(itemId, opts = {}) {
  return presentSheet(({ close }) => <ItemEditor itemId={itemId} justAdded={opts.justAdded} close={close} />);
}

function Field({ label, children }) {
  return (
    <div className="row">
      <div className="row-main">
        <span className="row-label">{label}</span>
        {children}
      </div>
    </div>
  );
}

function initialForm(item, units) {
  return {
    title: item.title || '',
    brand: item.brand || '',
    siteName: item.siteName || '',
    price: item.price == null ? '' : String(item.price),
    currency: item.currency || getState().user.settings.currency,
    quantity: item.quantity || 1,
    listId: item.listId,
    size: item.size || '',
    weight: String(fromGrams(item.weightG, units)),
    lengthCm: String(fromCm(item.lengthCm, units)),
    widthCm: String(fromCm(item.widthCm, units)),
    heightCm: String(fromCm(item.heightCm, units)),
    notes: item.notes || '',
    url: item.url,
  };
}

function ItemEditor({ itemId, justAdded, close }) {
  const item = useStore((s) => s.items.find((i) => i.id === itemId));
  const lists = useStore((s) => s.lists);
  const rates = useStore((s) => s.rates);
  const { currency, units } = useStore((s) => s.user.settings);
  const [form, setForm] = useState(() => (item ? initialForm(item, units) : null));
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!item) close();
  }, [item, close]);
  useEffect(() => {
    api(`/items/${itemId}/history`).then((r) => setHistory(r.history)).catch(() => {});
  }, [itemId, item?.price]);

  if (!item || !form) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const wUnit = units === 'imperial' ? 'lb' : 'kg';
  const lUnit = units === 'imperial' ? 'in' : 'cm';

  const buildPatch = () => {
    const f = form;
    const init = initialForm(item, units);
    const patch = {};
    for (const k of ['title', 'brand', 'siteName', 'currency', 'quantity', 'listId', 'size', 'notes', 'url']) {
      if (f[k] !== init[k]) patch[k] = f[k];
    }
    if (f.price !== init.price) patch.price = f.price === '' ? null : Number(String(f.price).replace(',', '.'));
    if (f.weight !== init.weight) patch.weightG = f.weight === '' ? null : toGrams(f.weight, units);
    for (const k of ['lengthCm', 'widthCm', 'heightCm']) if (f[k] !== init[k]) patch[k] = f[k] === '' ? null : toCm(f[k], units);
    return patch;
  };

  const save = async () => {
    const patch = buildPatch();
    if (!Object.keys(patch).length) return close();
    if ('price' in patch && patch.price != null && Number.isNaN(patch.price)) return toast('That price doesn’t look right', { error: true });
    setBusy(true);
    try {
      await updateItem(item.id, patch);
      close();
    } catch (err) {
      toast(err.message, { error: true });
      setBusy(false);
    }
  };

  const toggle = (k) => (v) => updateItem(item.id, { [k]: v }).catch((err) => toast(err.message, { error: true }));

  const refresh = async () => {
    setRefreshing(true);
    await refreshPrice(item);
    setRefreshing(false);
  };

  const changePhoto = async () => {
    const src = await promptAlert({ title: 'Change Photo', message: 'Paste a link to an image of this product.', placeholder: 'https://…', confirm: 'Use Image' });
    if (!src) return;
    try {
      await updateItem(item.id, { imageUrl: src });
      toast('Photo updated');
    } catch (err) {
      toast(err.message, { error: true });
    }
  };

  const conv = form.price !== '' && form.currency !== currency ? convert(Number(form.price) * form.quantity, form.currency, currency, rates) : null;

  return (
    <>
      <SheetHeader
        left={<GlassButton icon="x" title="Close" onClick={() => close()} />}
        title={justAdded ? 'Added' : 'Details'}
        right={<GlassButton icon="check" title="Save" prominent disabled={busy} onClick={save} />}
      />
      <div className="sheet-body">
        {justAdded && item.fetchError && (
          <div className="notice">
            <Icon name="warning" size={20} />
            <div>
              <b>Some details are missing.</b> {item.fetchError}. You can fill them in below.
            </div>
          </div>
        )}
        <div className="editor-hero">
          <div className="editor-img">
            <ProductImage src={item.image} fallback={item.brand || item.title} />
          </div>
          <div className="editor-actions">
            <a className="btn small" href={item.url} target="_blank" rel="noopener noreferrer">
              <Icon name="safari" size={18} /> Open {item.siteName || 'Website'}
            </a>
            <button className="btn small tinted" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Spinner /> : <Icon name="refresh" size={18} />} Refresh
            </button>
          </div>
        </div>

        <Group>
          <div className="row">
            <div className="row-main">
              <textarea className="row-input" style={{ minHeight: 48, fontWeight: 600 }} rows={2} value={form.title} onChange={set('title')} placeholder="Name" />
            </div>
          </div>
          <Field label="Brand">
            <input className="row-input" value={form.brand} onChange={set('brand')} placeholder="Brand" />
          </Field>
          <Field label="Store">
            <input className="row-input" value={form.siteName} onChange={set('siteName')} placeholder={item.domain} />
          </Field>
        </Group>

        <Group header="Price" footer={conv != null ? `≈ ${money(conv, currency)} in your currency` : undefined}>
          <Field label="Price">
            <input className="row-input" inputMode="decimal" value={form.price} onChange={set('price')} placeholder={`${currencySymbol(form.currency)}0.00`} />
            <select className="row-input" style={{ flex: 'none', width: 'auto' }} value={form.currency} onChange={set('currency')}>
              {[...new Set([form.currency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <span style={{ marginLeft: 'auto' }} className="stepper">
              <button onClick={() => setForm((f) => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))} disabled={form.quantity <= 1} aria-label="Fewer">
                <Icon name="minus" size={18} />
              </button>
              <span>{form.quantity}</span>
              <button onClick={() => setForm((f) => ({ ...f, quantity: Math.min(999, f.quantity + 1) }))} aria-label="More">
                <Icon name="plus" size={18} />
              </button>
            </span>
          </Field>
        </Group>

        {history.length > 1 && (
          <Group header="Price History">
            <Sparkline history={history} fallbackCurrency={item.currency || currency} />
          </Group>
        )}

        <Group>
          <Row icon="starFill" iconBg="var(--orange)" title="Favorite" right={<Toggle checked={item.favorite} onChange={toggle('favorite')} label="Favorite" />} />
          <Row icon="check" iconBg="var(--green)" title="Purchased" right={<Toggle checked={item.purchased} onChange={toggle('purchased')} label="Purchased" />} />
          <Field label="List">
            <select className="row-input" value={form.listId} onChange={set('listId')}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{`${l.emoji || ''} ${l.name}`.trim()}</option>
              ))}
            </select>
          </Field>
        </Group>

        <Group header="Tags" footer="Tags marked ✦ were added automatically.">
          <TagEditor item={item} />
        </Group>

        <Group header="Details">
          <Field label="Size / Variant">
            <input className="row-input" value={form.size} onChange={set('size')} placeholder="e.g. M, 10.5, Blue" />
          </Field>
          <Field label={`Weight (${wUnit})`}>
            <input className="row-input" inputMode="decimal" value={form.weight} onChange={set('weight')} placeholder="—" />
          </Field>
          <Field label={`Size (${lUnit})`}>
            <span style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center', color: 'var(--label-3)' }}>
              <input className="row-input" style={{ width: 44 }} inputMode="decimal" value={form.lengthCm} onChange={set('lengthCm')} placeholder="L" aria-label="Length" />×
              <input className="row-input" style={{ width: 44 }} inputMode="decimal" value={form.widthCm} onChange={set('widthCm')} placeholder="W" aria-label="Width" />×
              <input className="row-input" style={{ width: 44 }} inputMode="decimal" value={form.heightCm} onChange={set('heightCm')} placeholder="H" aria-label="Height" />
            </span>
          </Field>
        </Group>

        <Group header="Notes">
          <div className="row">
            <div className="row-main">
              <textarea className="row-input" value={form.notes} onChange={set('notes')} placeholder="Colour, size, gift ideas…" />
            </div>
          </div>
        </Group>

        <Group header="Link">
          <div className="row">
            <div className="row-main">
              <input className="row-input left" value={form.url} onChange={set('url')} type="url" autoCapitalize="none" spellCheck={false} />
            </div>
          </div>
          <Row icon="photo" iconBg="var(--accent)" title="Change Photo" chevron onClick={changePhoto} />
        </Group>

        <Group footer={`Added ${timeAgo(item.createdAt)}${item.checkedAt ? ` · Price checked ${timeAgo(item.checkedAt)}` : ''}`}>
          <Row centered destructive title="Delete Item" onClick={() => confirmDeleteItem(item, () => close())} />
        </Group>
      </div>
    </>
  );
}

function TagEditor({ item }) {
  const items = useStore((s) => s.items);
  const [text, setText] = useState('');
  const names = item.tags.map((t) => t.name.toLowerCase());
  const suggestions = useMemo(() => {
    const counts = new Map();
    for (const it of items) for (const t of it.tags) if (!names.includes(t.name.toLowerCase())) counts.set(t.name, (counts.get(t.name) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
  }, [items, names.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (tags) => updateItem(item.id, { tags }).catch((err) => toast(err.message, { error: true }));
  const add = (name) => {
    const n = name.trim().replace(/^#/, '');
    if (!n || names.includes(n.toLowerCase())) return;
    save([...item.tags, { name: n, auto: false }]);
    setText('');
  };
  const remove = (name) => save(item.tags.filter((t) => t.name !== name));

  return (
    <>
      <div className="tag-editor">
        {item.tags.map((t) => (
          <span key={t.name} className="tag-chip" style={{ '--tc': tagColor(t.name) }}>
            {t.auto && <span className="auto-dot" title="Added automatically">✦</span>}
            {t.name}
            <button onClick={() => remove(t.name)} aria-label={`Remove ${t.name}`}>
              <Icon name="x" size={12} weight={3} />
            </button>
          </span>
        ))}
        <input
          value={text}
          placeholder={item.tags.length ? 'Add tag' : 'Add a tag'}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add(text);
            if (e.key === 'Backspace' && !text && item.tags.length) remove(item.tags[item.tags.length - 1].name);
          }}
          onBlur={() => text && add(text)}
          enterKeyHint="done"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s} className="chip small" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Sparkline({ history, fallbackCurrency }) {
  const pts = history.filter((h) => h.price != null);
  if (pts.length < 2) return null;
  const prices = pts.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const t0 = pts[0].at;
  const span = pts[pts.length - 1].at - t0 || 1;
  const W = 300;
  const H = 64;
  const x = (p) => ((p.at - t0) / span) * W;
  const y = (p) => (max === min ? H / 2 : H - 4 - ((p.price - min) / (max - min)) * (H - 8));
  // Step line: a price holds until it changes.
  let d = `M${x(pts[0])},${y(pts[0])}`;
  for (let i = 1; i < pts.length; i++) d += `H${x(pts[i])}V${y(pts[i])}`;
  d += `H${W}`;
  const cur = pts[pts.length - 1].currency || fallbackCurrency;
  const falling = prices[prices.length - 1] < prices[0];
  const color = falling ? 'var(--green)' : prices[prices.length - 1] > prices[0] ? 'var(--orange)' : 'var(--accent)';
  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.25" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d}V${H}H0Z`} fill="url(#spark)" stroke="none" />
        <path d={d} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="sparkline-meta">
        <span>Low {money(min, cur)}</span>
        <span>Since {new Date(t0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>High {money(max, cur)}</span>
      </div>
    </div>
  );
}
