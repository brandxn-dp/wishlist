import { useCallback, useMemo } from 'react';
import { useStore } from '../store.js';
import { colorOf, useDark } from '../theme.js';
import { Page, Group, Row, GlassButton, useNav, useLongPress, contextMenu, actionSheet } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { money, totals, priceDrop, plural } from '../format.js';
import ListDetail from './ListDetail.jsx';
import { openListEditor, openShareSheet, confirmDeleteList, openReorderSheet } from './ListSheets.jsx';

export default function ListsScreen() {
  const lists = useStore((s) => s.lists);
  const items = useStore((s) => s.items);
  const rates = useStore((s) => s.rates);
  const currency = useStore((s) => s.user.settings.currency);
  const nav = useNav();
  const dark = useDark();

  const byList = useMemo(() => {
    const m = new Map(lists.map((l) => [l.id, []]));
    for (const it of items) m.get(it.listId)?.push(it);
    return m;
  }, [lists, items]);

  const all = totals(items, currency, rates);
  const open = items.filter((i) => !i.purchased);
  const smart = [
    { id: 'all', label: 'All Items', icon: 'bag', color: 'blue', items: open },
    { id: 'favorites', label: 'Favorites', icon: 'starFill', color: 'orange', items: open.filter((i) => i.favorite) },
    { id: 'drops', label: 'Price Drops', icon: 'arrowDown', color: 'green', items: open.filter((i) => priceDrop(i) > 0) },
    { id: 'purchased', label: 'Purchased', icon: 'check', color: 'graphite', items: items.filter((i) => i.purchased) },
  ];
  const drops = smart[2].items.length;

  const newList = async () => {
    const list = await openListEditor();
    if (list) nav.push(<ListDetail listId={list.id} />);
  };

  const menu = () =>
    actionSheet({
      actions: [
        { label: 'New List', onSelect: newList },
        lists.length > 1 && { label: 'Reorder Lists', onSelect: openReorderSheet },
      ],
    });

  return (
    <Page title="Wishlists" right={<GlassButton icon="ellipsis" title="More" onClick={menu} />}>
      <div className="content">
        <div className="hero" style={{ '--hero': 'var(--accent)' }}>
          <div className="hero-label">Everything you want</div>
          <div className="hero-total">{money(all.total, currency)}</div>
          <div className="hero-sub">
            <span>{plural(all.count, 'item')}</span>
            <span>{plural(lists.length, 'list')}</span>
            {drops > 0 && <span>↓ {plural(drops, 'price drop')}</span>}
          </div>
          {(all.unpriced > 0 || all.unconverted > 0) && (
            <div className="hero-note">
              {all.unpriced > 0 && `${all.unpriced} without a price. `}
              {all.unconverted > 0 && `${all.unconverted} couldn't be converted.`}
            </div>
          )}
          <div className="hero-emoji">🛍️</div>
        </div>

        <div className="smart-grid">
          {smart.map((s) => {
            const t = totals(s.items, currency, rates);
            return (
              <button key={s.id} className="smart" onClick={() => nav.push(<ListDetail smart={s.id} />)}>
                <div className="row-icon" style={{ background: colorOf(s.color, dark) }}>
                  <Icon name={s.icon} size={19} weight={2.4} />
                </div>
                <div className="smart-count">{s.items.length}</div>
                <div className="smart-label">
                  <span>{s.label}</span>
                  <span>{s.items.length ? money(s.id === 'purchased' ? t.purchased : t.total, currency, { compact: true }) : ''}</span>
                </div>
              </button>
            );
          })}
        </div>

        <Group header="My Lists">
          {lists.map((l) => (
            <ListRow key={l.id} list={l} items={byList.get(l.id) || []} />
          ))}
          {!lists.length && <Row title="No lists yet" subtitle="Create one to start collecting." />}
        </Group>
        <button className="add-list-btn" onClick={newList}>
          <Icon name="plus" size={22} weight={2.6} /> New List
        </button>
      </div>
    </Page>
  );
}

function ListRow({ list, items }) {
  const nav = useNav();
  const dark = useDark();
  const rates = useStore((s) => s.rates);
  const currency = useStore((s) => s.user.settings.currency);
  const t = totals(items, currency, rates);

  const onLong = useCallback(() => {
    contextMenu({
      preview: (
        <>
          <div className="row-icon round" style={{ background: colorOf(list.color, dark), margin: 0, width: 48, height: 48, fontSize: 24 }}>{list.emoji}</div>
          <div className="ctx-preview-text">
            <div>{list.name}</div>
            <div>{plural(t.count, 'item')} · {money(t.total, currency)}</div>
          </div>
        </>
      ),
      actions: [
        { label: 'Edit List', icon: 'pencil', onSelect: () => openListEditor(list) },
        { label: list.shareToken ? 'Sharing…' : 'Share List', icon: 'share', onSelect: () => openShareSheet(list.id) },
        { label: 'Delete List', icon: 'trash', destructive: true, onSelect: () => confirmDeleteList(list) },
      ],
    });
  }, [list, dark, t.count, t.total, currency]);
  const press = useLongPress(onLong);

  return (
    <Row
      {...press}
      emoji={list.emoji}
      round
      iconBg={colorOf(list.color, dark)}
      title={list.name}
      subtitle={`${plural(t.count, 'item')}${t.bought ? ` · ${t.bought} purchased` : ''}${list.shareToken ? ' · Shared' : ''}`}
      detail={t.count ? money(t.total, currency) : ''}
      strong
      chevron
      onClick={() => nav.push(<ListDetail listId={list.id} />)}
    />
  );
}
