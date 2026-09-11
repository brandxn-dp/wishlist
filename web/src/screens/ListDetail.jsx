import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore, nav as navState, updateItem, deleteItem, refreshItem, updateSettings, getState } from '../store.js';
import { colorOf, useDark } from '../theme.js';
import {
  Page, Group, GlassButton, SearchField, ProductImage, Empty, useNav, useLongPress, contextMenu, actionSheet, confirmAlert, toast,
} from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { money, convert, totals, priceDrop, plural, tagColor } from '../format.js';
import { openAddSheet, openItemEditor } from './ItemSheets.jsx';
import { openListEditor, openShareSheet, confirmDeleteList } from './ListSheets.jsx';

const SMART = {
  all: { name: 'All Items', icon: 'bag', color: 'blue' },
  favorites: { name: 'Favorites', icon: 'starFill', color: 'orange' },
  drops: { name: 'Price Drops', icon: 'arrowDown', color: 'green' },
  purchased: { name: 'Purchased', icon: 'check', color: 'graphite' },
};

const SORTS = [
  { id: 'added', label: 'Recently Added' },
  { id: 'price-asc', label: 'Price: Low to High' },
  { id: 'price-desc', label: 'Price: High to Low' },
  { id: 'name', label: 'Name' },
  { id: 'store', label: 'Store' },
];

export const openLink = (item) => window.open(item.url, '_blank', 'noopener,noreferrer');

export default function ListDetail({ listId, smart, tag }) {
  const list = useStore((s) => (listId ? s.lists.find((l) => l.id === listId) : null));
  const items = useStore((s) => s.items);
  const rates = useStore((s) => s.rates);
  const settings = useStore((s) => s.user.settings);
  const { currency, sort = 'added', layout = 'grid', showConverted } = settings;
  const nav = useNav();
  const dark = useDark();
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [showBought, setShowBought] = useState(false);

  // Let the + button know which list is on screen.
  useEffect(() => {
    if (!listId || !nav.isTop) return;
    navState.activeListId = listId;
    return () => {
      if (navState.activeListId === listId) navState.activeListId = null;
    };
  }, [listId, nav.isTop]);

  useEffect(() => {
    if (listId && !list && nav.isTop) nav.pop();
  }, [listId, list, nav]);

  const meta = list
    ? { name: list.name, emoji: list.emoji, color: colorOf(list.color, dark) }
    : tag
      ? { name: tag, icon: 'tagFill', color: tagColor(tag) }
      : { ...SMART[smart], color: colorOf(SMART[smart].color, dark) };

  const base = useMemo(() => {
    if (listId) return items.filter((i) => i.listId === listId);
    if (tag) return items.filter((i) => i.tags.some((t) => t.name.toLowerCase() === tag.toLowerCase()));
    if (smart === 'favorites') return items.filter((i) => i.favorite);
    if (smart === 'drops') return items.filter((i) => priceDrop(i) > 0 && !i.purchased);
    if (smart === 'purchased') return items.filter((i) => i.purchased);
    return items;
  }, [items, listId, tag, smart]);

  const tagCounts = useMemo(() => {
    const m = new Map();
    for (const it of base) for (const t of it.tags) m.set(t.name, (m.get(t.name) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([name]) => name).filter((n) => !tag || n.toLowerCase() !== tag.toLowerCase());
  }, [base, tag]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = base.filter((i) => {
      if (tagFilter && !i.tags.some((t) => t.name === tagFilter)) return false;
      if (!q) return true;
      return [i.title, i.brand, i.siteName, i.domain, i.notes, ...i.tags.map((t) => t.name)].some((v) => v?.toLowerCase().includes(q));
    });
    const value = (i) => (i.price == null ? null : convert(i.price, i.currency || currency, currency, rates) ?? i.price);
    const cmp = {
      added: (a, b) => b.createdAt - a.createdAt,
      'price-asc': (a, b) => (value(a) ?? Infinity) - (value(b) ?? Infinity),
      'price-desc': (a, b) => (value(b) ?? -Infinity) - (value(a) ?? -Infinity),
      name: (a, b) => (a.title || '').localeCompare(b.title || ''),
      store: (a, b) => (a.siteName || a.domain || '').localeCompare(b.siteName || b.domain || '') || b.createdAt - a.createdAt,
    }[sort] || (() => 0);
    out = [...out].sort((a, b) => (b.favorite - a.favorite) * (sort === 'added' ? 1 : 0) || cmp(a, b));
    return out;
  }, [base, query, tagFilter, sort, currency, rates]);

  const splitBought = smart !== 'purchased';
  const open = splitBought ? visible.filter((i) => !i.purchased) : visible;
  const bought = splitBought ? visible.filter((i) => i.purchased) : [];
  const t = totals(base, currency, rates);

  const sortMenu = () =>
    actionSheet({
      title: 'Sort By',
      actions: SORTS.map((s) => ({ label: s.label, checked: s.id === sort, onSelect: () => updateSettings({ sort: s.id }) })),
    });

  const listMenu = () =>
    actionSheet({
      title: list.name,
      actions: [
        { label: 'Edit List', onSelect: () => openListEditor(list) },
        { label: list.shareToken ? 'Sharing Options' : 'Share List', onSelect: () => openShareSheet(list.id) },
        { label: 'Sort By…', onSelect: sortMenu },
        { label: 'Delete List', destructive: true, onSelect: () => confirmDeleteList(list, () => nav.pop()) },
      ],
    });

  const cardProps = { currency, rates, showConverted, showList: !listId };
  const renderItems = (arr) =>
    layout === 'rows' ? (
      <Group className="item-rows">
        {arr.map((i) => (
          <ItemRow key={i.id} item={i} {...cardProps} />
        ))}
      </Group>
    ) : (
      <div className="grid">
        {arr.map((i) => (
          <ItemCard key={i.id} item={i} {...cardProps} />
        ))}
      </div>
    );

  return (
    <Page
      title={meta.name}
      titleNode={
        <>
          {meta.emoji && <span className="emoji">{meta.emoji}</span>}
          {meta.name}
        </>
      }
      right={
        <>
          {list && <GlassButton icon="plus" title="Add item" onClick={() => openAddSheet('', { listId })} />}
          <GlassButton icon="ellipsis" title="More" onClick={list ? listMenu : sortMenu} />
        </>
      }
    >
      <div className="content wide">
        {base.length > 0 && (
          <div className="hero" style={{ '--hero': meta.color }}>
            <div className="hero-label">{smart === 'purchased' ? 'Spent' : 'Total'}</div>
            <div className="hero-total">{money(smart === 'purchased' ? t.purchased : t.total, currency)}</div>
            <div className="hero-sub">
              <span>{plural(smart === 'purchased' ? t.bought : t.count, 'item')}</span>
              {smart !== 'purchased' && t.bought > 0 && <span>{money(t.purchased, currency)} purchased</span>}
              {list?.shareToken && <span>· Shared</span>}
            </div>
            {(t.unpriced > 0 || t.unconverted > 0) && (
              <div className="hero-note">
                {t.unpriced > 0 && `${t.unpriced} without a price. `}
                {t.unconverted > 0 && `${t.unconverted} in a currency we couldn't convert.`}
              </div>
            )}
            {meta.emoji && <div className="hero-emoji">{meta.emoji}</div>}
          </div>
        )}

        {base.length > 0 && (
          <>
            <div className="toolbar">
              <SearchField value={query} onChange={setQuery} placeholder={`Search ${meta.name}`} />
              <GlassButton icon={layout === 'grid' ? 'rows' : 'grid'} title={layout === 'grid' ? 'Show as list' : 'Show as grid'} onClick={() => updateSettings({ layout: layout === 'grid' ? 'rows' : 'grid' })} />
              <GlassButton icon="sort" title="Sort" onClick={sortMenu} />
            </div>
            {tagCounts.length > 1 && (
              <div className="chips">
                <button className={`chip ${!tagFilter ? 'on' : ''}`} onClick={() => setTagFilter(null)}>All</button>
                {tagCounts.map((name) => (
                  <button key={name} className={`chip ${tagFilter === name ? 'on' : ''}`} onClick={() => setTagFilter(tagFilter === name ? null : name)}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {base.length === 0 ? (
          <Empty
            icon={meta.icon || 'bag'}
            title={list ? 'Nothing here yet' : smart === 'drops' ? 'No price drops yet' : 'Nothing here'}
            text={
              list
                ? 'Paste a link to any product page and it will appear here with its photo, price and store.'
                : smart === 'drops'
                  ? "Prices are re-checked in the background. When something gets cheaper, it'll show up here."
                  : smart === 'favorites'
                    ? 'Star items you really want and they will be collected here.'
                    : 'Items you add will show up here.'
            }
          >
            {list && (
              <button className="btn mt" onClick={() => openAddSheet('', { listId })}>
                <Icon name="plus" size={20} weight={2.6} /> Add Item
              </button>
            )}
          </Empty>
        ) : visible.length === 0 ? (
          <Empty icon="search" title="No results" text="Try a different search or filter." />
        ) : (
          <>
            {open.length > 0 && renderItems(open)}
            {bought.length > 0 && (
              <>
                <button className={`section-toggle ${showBought ? '' : 'closed'}`} onClick={() => setShowBought(!showBought)}>
                  Purchased <span className="muted" style={{ fontWeight: 500 }}>{bought.length}</span>
                  <Icon name="chevronDown" size={18} weight={2.8} />
                </button>
                {showBought && renderItems(bought)}
              </>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

/* ───────── item presentation ───────── */

export function PriceTag({ item, currency, rates, showConverted }) {
  if (item.price == null) return <span className="price none">No price</span>;
  const cur = item.currency || currency;
  const conv = showConverted && cur !== currency ? convert(item.price, cur, currency, rates) : null;
  return (
    <span style={{ minWidth: 0 }}>
      <span className="price">{money(item.price, cur)}</span>
      {item.quantity > 1 && <span className="qty"> ×{item.quantity}</span>}
      {conv != null && <div className="price-conv">≈ {money(conv, currency)}</div>}
    </span>
  );
}

function useItemMenu(item, readOnly) {
  return useCallback(() => {
    if (readOnly) return openLink(item);
    const lists = getState().lists;
    const listName = lists.find((l) => l.id === item.listId)?.name;
    contextMenu({
      preview: (
        <>
          <div className="thumb"><ProductImage src={item.image} fallback={item.brand || item.title} /></div>
          <div className="ctx-preview-text">
            <div>{item.title}</div>
            <div>{[item.siteName || item.domain, listName].filter(Boolean).join(' · ')}</div>
          </div>
        </>
      ),
      actions: [
        { label: `Open ${item.siteName || 'Website'}`, icon: 'safari', onSelect: () => openLink(item) },
        { label: 'Edit Details', icon: 'pencil', onSelect: () => openItemEditor(item.id) },
        { label: item.purchased ? 'Mark as Not Purchased' : 'Mark as Purchased', icon: item.purchased ? 'bag' : 'check', onSelect: () => updateItem(item.id, { purchased: !item.purchased }).catch(fail) },
        { label: item.favorite ? 'Remove from Favorites' : 'Add to Favorites', icon: item.favorite ? 'star' : 'starFill', onSelect: () => updateItem(item.id, { favorite: !item.favorite }).catch(fail) },
        lists.length > 1 && { label: 'Move to List…', icon: 'folder', onSelect: () => moveItem(item) },
        { label: 'Refresh Price', icon: 'refresh', onSelect: () => refreshPrice(item) },
        { label: 'Copy Link', icon: 'copy', gap: true, onSelect: () => navigator.clipboard?.writeText(item.url).then(() => toast('Link copied')) },
        { label: 'Delete', icon: 'trash', destructive: true, onSelect: () => confirmDeleteItem(item) },
      ],
    });
  }, [item, readOnly]);
}

const fail = (err) => toast(err.message, { error: true });

function moveItem(item) {
  const { lists } = getState();
  actionSheet({
    title: 'Move to List',
    actions: lists.map((l) => ({
      label: `${l.emoji || ''} ${l.name}`.trim(),
      checked: l.id === item.listId,
      onSelect: () => l.id !== item.listId && updateItem(item.id, { listId: l.id }).then(() => toast(`Moved to ${l.name}`)).catch(fail),
    })),
  });
}

export async function refreshPrice(item) {
  toast('Checking the latest price…', { icon: 'refresh' });
  try {
    const fresh = await refreshItem(item.id);
    const { currency } = getState().user.settings;
    if (fresh.price != null && fresh.price !== item.price) toast(`Price updated: ${money(fresh.price, fresh.currency || currency)}`);
    else if (fresh.fetchStatus !== 'ok' && fresh.fetchError) toast(fresh.fetchError, { error: true });
    else toast('Price is unchanged');
  } catch (err) {
    fail(err);
  }
}

export async function confirmDeleteItem(item, after) {
  const ok = await confirmAlert({ title: 'Delete this item?', message: item.title, confirm: 'Delete', destructive: true });
  if (!ok) return false;
  after?.();
  await deleteItem(item.id).catch(fail);
  return true;
}

export function ItemCard({ item, currency, rates, showConverted, readOnly }) {
  const menu = useItemMenu(item, readOnly);
  const press = useLongPress(menu);
  const drop = priceDrop(item);
  return (
    <div
      className={`card ${item.purchased ? 'purchased' : ''}`}
      {...(readOnly ? {} : press)}
      onClick={() => openLink(item)}
      onKeyDown={(e) => e.key === 'Enter' && openLink(item)}
      role="link"
      tabIndex={0}
      title={item.title}
    >
      <div className="card-img">
        <ProductImage src={item.image} fallback={item.brand || item.title} />
        <div className="badges">
          {drop > 0 && (
            <span className="badge">
              <Icon name="arrowDown" size={12} weight={3.2} />
              {drop}%
            </span>
          )}
          {item.favorite && (
            <span className="badge star">
              <Icon name="starFill" size={13} />
            </span>
          )}
        </div>
        {!readOnly && (
          <button className="card-more" aria-label="More options" onClick={(e) => (e.stopPropagation(), menu())} onPointerDown={(e) => e.stopPropagation()}>
            <Icon name="ellipsis" size={18} />
          </button>
        )}
        {item.purchased && (
          <div className="bought-overlay">
            <Icon name="checkCircle" size={44} />
          </div>
        )}
      </div>
      <div className="card-body">
        {item.brand && <div className="card-brand">{item.brand}</div>}
        <div className="card-title">{item.title}</div>
        <div className="card-foot">
          <PriceTag item={item} currency={currency} rates={rates} showConverted={showConverted} />
          <span className="site">{item.siteName || item.domain}</span>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item, currency, rates, showConverted }) {
  const menu = useItemMenu(item);
  const press = useLongPress(menu);
  const drop = priceDrop(item);
  return (
    <div className="row tappable" style={{ cursor: 'pointer', opacity: item.purchased ? 0.55 : 1 }} {...press} onClick={() => openLink(item)} role="link" tabIndex={0}>
      <div className="thumb">
        <ProductImage src={item.image} fallback={item.brand || item.title} />
      </div>
      <div className="row-main">
        <div className="row-text">
          <div className="row-title" style={{ fontSize: 16, fontWeight: 500 }}>
            {item.favorite && <Icon name="starFill" size={13} style={{ color: 'var(--orange)', marginRight: 4, verticalAlign: -1 }} />}
            {item.title}
          </div>
          <div className="row-subtitle">{[item.brand, item.siteName || item.domain].filter(Boolean).join(' · ')}</div>
          {drop > 0 && <div className="row-subtitle" style={{ color: 'var(--green)', fontWeight: 600 }}>↓ {drop}% since added</div>}
        </div>
        <div className="item-row-price">
          <PriceTag item={item} currency={currency} rates={rates} showConverted={showConverted} />
        </div>
        <button className="glass-btn icon" style={{ width: 34, height: 34, minWidth: 34, background: 'var(--fill-3)', boxShadow: 'none' }} aria-label="More options" onClick={(e) => (e.stopPropagation(), menu())} onPointerDown={(e) => e.stopPropagation()}>
          <Icon name="ellipsis" size={16} />
        </button>
      </div>
    </div>
  );
}
